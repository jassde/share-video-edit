use crate::types::{ExportOptions, ExportState, Segment, ToolsStatus, VideoMetadata};
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter};

fn validate_media_path(path: &str) -> Result<(), String> {
    if path.is_empty() {
        return Err("Path cannot be empty".into());
    }
    if path.starts_with('-') {
        return Err(format!("Invalid path (starts with '-'): {path}"));
    }
    if path.chars().any(|c| c == '\n' || c == '\r' || c == '\0') {
        return Err("Path contains invalid control characters".into());
    }
    Ok(())
}

/// Spawn a child process without a visible console window on Windows.
/// On other platforms this is identical to `Command::new`.
fn silent_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

/// Return the executable path for `name`, joining with `dir` when non-empty.
/// An empty `dir` means "find on PATH", so the bare name is returned.
fn resolve_tool(name: &str, dir: &str) -> String {
    if dir.is_empty() {
        name.to_string()
    } else {
        std::path::Path::new(dir).join(name).to_string_lossy().into_owned()
    }
}

/// Common installation directories to probe when scanning for FFmpeg.
fn candidate_dirs() -> Vec<String> {
    let mut dirs: Vec<String> = Vec::new();

    #[cfg(target_os = "windows")]
    {
        dirs.push(r"C:\ffmpeg\bin".to_string());
        dirs.push(r"C:\Program Files\ffmpeg\bin".to_string());
        dirs.push(r"C:\Program Files (x86)\ffmpeg\bin".to_string());
        dirs.push(r"C:\ProgramData\chocolatey\bin".to_string());
        if let Ok(home) = std::env::var("USERPROFILE") {
            dirs.push(format!(r"{}\scoop\apps\ffmpeg\current\bin", home));
            dirs.push(format!(r"{}\AppData\Local\Microsoft\WinGet\Links", home));
        }
    }

    #[cfg(target_os = "macos")]
    {
        dirs.push("/opt/homebrew/bin".to_string()); // Apple Silicon Homebrew
        dirs.push("/usr/local/bin".to_string());    // Intel Homebrew / manual
        dirs.push("/opt/local/bin".to_string());    // MacPorts
    }

    #[cfg(target_os = "linux")]
    {
        dirs.push("/usr/bin".to_string());
        dirs.push("/usr/local/bin".to_string());
        dirs.push("/snap/bin".to_string());
    }

    dirs
}

/// Pure function — testable without spawning a process.
pub fn parse_ffprobe_output(raw: &str, path: &str) -> Result<VideoMetadata, String> {
    let v: serde_json::Value =
        serde_json::from_str(raw).map_err(|e| format!("JSON parse error: {e}"))?;
    let streams = v["streams"].as_array().ok_or("No streams in ffprobe output")?;
    let video = streams
        .iter()
        .find(|s| s["codec_type"].as_str() == Some("video"))
        .ok_or("No video stream found")?;
    let duration = v["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .ok_or("Missing duration")?;
    let width = video["width"].as_u64().ok_or("Missing width")? as u32;
    let height = video["height"].as_u64().ok_or("Missing height")? as u32;
    let fps = video["avg_frame_rate"]
        .as_str()
        .and_then(parse_fraction)
        .ok_or("Missing or invalid avg_frame_rate")?;
    Ok(VideoMetadata {
        duration,
        width,
        height,
        fps,
        path: path.to_string(),
    })
}

fn parse_fraction(s: &str) -> Option<f64> {
    let parts: Vec<&str> = s.split('/').collect();
    if parts.len() != 2 {
        return None;
    }
    let num: f64 = parts[0].parse().ok()?;
    let den: f64 = parts[1].parse().ok()?;
    if den == 0.0 {
        return None;
    }
    Some(num / den)
}

/// Parse `out_time_us=N` (or `out_time_ms`) lines from ffmpeg -progress output.
pub fn parse_progress_line(line: &str) -> Option<f64> {
    let (k, v) = line.split_once('=')?;
    let micros: f64 = v.trim().parse().ok()?;
    match k.trim() {
        "out_time_us" | "out_time_ms" => Some(micros / 1_000_000.0),
        _ => None,
    }
}

#[tauri::command]
pub async fn check_tools(ffmpeg_dir: String) -> ToolsStatus {
    tokio::task::spawn_blocking(move || {
        let probe = |path: String| {
            silent_command(&path)
                .arg("-version")
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map(|s| s.success())
                .unwrap_or(false)
        };
        ToolsStatus {
            ffmpeg: probe(resolve_tool("ffmpeg", &ffmpeg_dir)),
            ffprobe: probe(resolve_tool("ffprobe", &ffmpeg_dir)),
        }
    })
    .await
    .unwrap_or(ToolsStatus { ffmpeg: false, ffprobe: false })
}

/// Probe common installation directories and return the first one that
/// contains a working `ffmpeg` binary. Returns `None` if none found.
#[tauri::command]
pub async fn scan_ffmpeg() -> Option<String> {
    tokio::task::spawn_blocking(|| {
        for dir in candidate_dirs() {
            let path = std::path::Path::new(&dir).join("ffmpeg");
            if silent_command(&path.to_string_lossy())
                .arg("-version")
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map(|s| s.success())
                .unwrap_or(false)
            {
                return Some(dir);
            }
        }
        None
    })
    .await
    .ok()
    .flatten()
}

#[tauri::command]
pub async fn load_video(path: String, ffmpeg_dir: String) -> Result<VideoMetadata, String> {
    validate_media_path(&path)?;
    tokio::task::spawn_blocking(move || {
        let ffprobe = resolve_tool("ffprobe", &ffmpeg_dir);
        let output = silent_command(&ffprobe)
            .args([
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                &path,
            ])
            .output()
            .map_err(|e| format!("ffprobe not found or failed to start: {e}"))?;
        if !output.status.success() {
            return Err(format!(
                "ffprobe error: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        parse_ffprobe_output(&String::from_utf8_lossy(&output.stdout), &path)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

/// GPU encoder families detected by suffix.
fn is_nvenc(codec: &str) -> bool { codec.ends_with("_nvenc") }
fn is_qsv(codec: &str)   -> bool { codec.ends_with("_qsv") }
fn is_amf(codec: &str)   -> bool { codec.ends_with("_amf") }
fn is_videotoolbox(codec: &str) -> bool { codec.ends_with("_videotoolbox") }

pub fn is_gpu_encoder(codec: &str) -> bool {
    is_nvenc(codec) || is_qsv(codec) || is_amf(codec) || is_videotoolbox(codec)
}

/// Map logical codec names to their software encoder identifiers.
/// GPU encoder names are already ffmpeg-ready and pass through unchanged.
fn resolve_encoder(codec: &str) -> &str {
    match codec {
        "h265" => "libx265",
        "vp9"  => "libvpx-vp9",
        "av1"  => "libaom-av1",
        "h264" => "libx264",
        other  => other, // GPU encoder names pass through as-is
    }
}

/// Return the quality flag(s) appropriate for the encoder.
/// Software encoders use -crf; each GPU family has its own flag.
fn quality_args(codec: &str, crf: u32) -> Vec<String> {
    let v = crf.to_string();
    if is_nvenc(codec) {
        // VBR constant-quality mode: -rc vbr -cq <val>
        vec!["-rc".into(), "vbr".into(), "-cq".into(), v]
    } else if is_qsv(codec) {
        vec!["-global_quality".into(), v]
    } else if is_amf(codec) {
        // Constant QP: apply the same QP to I and P frames
        vec!["-rc".into(), "cqp".into(), "-qp_i".into(), v.clone(), "-qp_p".into(), v]
    } else if is_videotoolbox(codec) {
        vec!["-q:v".into(), v]
    } else {
        vec!["-crf".into(), v]
    }
}

fn build_encode_args(options: &ExportOptions) -> Vec<String> {
    let encoder = resolve_encoder(options.codec.as_str());
    let mut args: Vec<String> = vec!["-c:v".into(), encoder.into()];
    args.extend(quality_args(options.codec.as_str(), options.crf));
    // Presets: software only (not AV1 or any GPU encoder)
    let is_gpu = is_gpu_encoder(options.codec.as_str());
    // VP9 (libvpx-vp9) uses -cpu-used/-deadline, not -preset.
    if options.codec != "av1" && options.codec != "vp9" && !is_gpu {
        args.extend(["-preset".into(), options.preset.clone()]);
    }
    args.extend(["-c:a".into(), "aac".into()]);
    // QuickTime / iOS require the hvc1 box tag for HEVC in MP4.
    if options.codec == "hevc_videotoolbox" {
        args.extend(["-tag:v".into(), "hvc1".into()]);
    }
    args
}

fn ext_for_codec(codec: &str) -> &'static str {
    match codec {
        "vp9" => "webm",
        _ => "mp4", // GPU codecs (nvenc/qsv/amf/videotoolbox) all produce mp4
    }
}

/// Probe ffmpeg for available GPU-accelerated video encoders and return
/// the list of detected names.  Returns an empty vec if ffmpeg is not found.
#[tauri::command]
pub async fn detect_encoders(ffmpeg_dir: String) -> Vec<String> {
    tokio::task::spawn_blocking(move || {
        const GPU_CANDIDATES: &[&str] = &[
            "h264_nvenc", "hevc_nvenc", "av1_nvenc",
            "h264_qsv",   "hevc_qsv",
            "h264_amf",   "hevc_amf",
            "h264_videotoolbox", "hevc_videotoolbox",
        ];
        let ffmpeg = resolve_tool("ffmpeg", &ffmpeg_dir);
        let output = silent_command(&ffmpeg)
            .args(["-hide_banner", "-encoders"])
            .stderr(Stdio::null())
            .output();
        let text = match output {
            Err(_) => return vec![],
            Ok(o)  => String::from_utf8_lossy(&o.stdout).into_owned(),
        };
        GPU_CANDIDATES
            .iter()
            .filter(|&&enc| text.contains(enc))
            .map(|&s| s.to_string())
            .collect()
    })
    .await
    .unwrap_or_default()
}

fn run_ffmpeg_with_progress(
    ffmpeg_path: &str,
    args: &[String],
    app: &AppHandle,
    cancel: &Arc<std::sync::atomic::AtomicBool>,
    segment_index: usize,
    total_count: usize,
    seg_duration: f64,
    total_duration: f64,
    elapsed_duration: f64,
) -> Result<(), String> {
    let mut full_args: Vec<String> = vec![
        "-y".into(), "-progress".into(), "pipe:1".into(), "-nostats".into(),
    ];
    full_args.extend_from_slice(args);

    let mut child = silent_command(ffmpeg_path)
        .args(&full_args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn ffmpeg: {e}"))?;

    let stdout = child.stdout.take().ok_or("No stdout on ffmpeg child")?;
    let stderr = child.stderr.take().ok_or("No stderr on ffmpeg child")?;

    // Drain stderr on a separate thread so its pipe buffer never fills and
    // deadlocks ffmpeg while we block on stdout progress lines.
    let stderr_thread = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = BufReader::new(stderr).read_to_end(&mut buf);
        buf
    });

    let reader = BufReader::new(stdout);
    let mut cancelled = false;
    for line in reader.lines().map_while(Result::ok) {
        if cancel.load(Ordering::Relaxed) {
            let _ = child.kill();
            cancelled = true;
            break;
        }
        if let Some(t) = parse_progress_line(&line) {
            let seg_pct = if seg_duration > 0.0 {
                (t / seg_duration).clamp(0.0, 1.0)
            } else {
                0.0
            };
            let overall = if total_duration > 0.0 {
                ((elapsed_duration + t) / total_duration * 100.0).clamp(0.0, 100.0)
            } else {
                0.0
            };
            let _ = app.emit(
                "export-progress",
                serde_json::json!({
                    "current": segment_index + 1,
                    "total": total_count,
                    "percent": overall,
                    "segmentPercent": seg_pct * 100.0,
                }),
            );
        }
    }

    if cancelled {
        let _ = child.wait(); // reap zombie
        let _ = stderr_thread.join();
        return Err("Export cancelled".into());
    }

    let status = child.wait().map_err(|e| format!("ffmpeg wait error: {e}"))?;
    let stderr_bytes = stderr_thread.join().unwrap_or_default();
    if !status.success() {
        return Err(format!(
            "ffmpeg failed on segment {}: {}",
            segment_index + 1,
            String::from_utf8_lossy(&stderr_bytes)
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn export_segments(
    app: AppHandle,
    state: tauri::State<'_, ExportState>,
    source: String,
    segments: Vec<Segment>,
    options: ExportOptions,
    ffmpeg_dir: String,
) -> Result<Vec<String>, String> {
    if segments.is_empty() {
        return Err("No segments to export".into());
    }
    validate_media_path(&source)?;
    validate_media_path(&options.output_dir)?;

    // Reset cancellation flag for this export run.
    state.cancel.store(false, Ordering::SeqCst);
    let cancel = Arc::clone(&state.cancel);
    let app_clone = app.clone();
    let ffmpeg_path = resolve_tool("ffmpeg", &ffmpeg_dir);

    tokio::task::spawn_blocking(move || {
        let total = segments.len();
        let total_duration: f64 = segments.iter().map(|s| s.out_point - s.in_point).sum();

        let stem = std::path::Path::new(&source)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("clip")
            .to_string();

        let ext = if options.lossless {
            std::path::Path::new(&source)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("mp4")
        } else {
            ext_for_codec(&options.codec)
        };

        let mut per_segment_paths: Vec<String> = Vec::with_capacity(total);
        let mut elapsed_duration = 0.0_f64;

        for (i, seg) in segments.iter().enumerate() {
            if cancel.load(Ordering::Relaxed) {
                return Err("Export cancelled".into());
            }

            let seg_duration = seg.out_point - seg.in_point;
            let out_path = std::path::Path::new(&options.output_dir)
                .join(format!("{}_cut-seg-{}.{}", stem, i + 1, ext))
                .to_string_lossy()
                .to_string();

            let mut args: Vec<String> = Vec::new();
            if options.lossless {
                args.extend([
                    "-ss".into(), format!("{:.6}", seg.in_point),
                    "-to".into(), format!("{:.6}", seg.out_point),
                    "-i".into(), source.clone(),
                    "-c".into(), "copy".into(),
                    "-avoid_negative_ts".into(), "make_zero".into(),
                ]);
            } else {
                args.extend([
                    "-i".into(), source.clone(),
                    "-ss".into(), format!("{:.6}", seg.in_point),
                    "-to".into(), format!("{:.6}", seg.out_point),
                ]);
                args.extend(build_encode_args(&options));
            }
            args.push(out_path.clone());

            if let Err(e) = run_ffmpeg_with_progress(
                &ffmpeg_path, &args, &app_clone, &cancel,
                i, total, seg_duration, total_duration, elapsed_duration,
            ) {
                // Remove partial output so the user's directory stays clean.
                let _ = std::fs::remove_file(&out_path);
                return Err(e);
            }
            per_segment_paths.push(out_path);
            elapsed_duration += seg_duration;
        }

        if options.concat && per_segment_paths.len() > 1 {
            let list_path = std::path::Path::new(&options.output_dir)
                .join(format!("{}_concat.txt", stem))
                .to_string_lossy()
                .to_string();

            let mut list_content = String::new();
            for p in &per_segment_paths {
                let escaped = p.replace('\'', "'\\''");
                list_content.push_str(&format!("file '{}'\n", escaped));
            }
            let mut f = std::fs::File::create(&list_path)
                .map_err(|e| format!("Cannot write concat list: {e}"))?;
            f.write_all(list_content.as_bytes())
                .map_err(|e| format!("Cannot write concat list: {e}"))?;

            let combined_path = std::path::Path::new(&options.output_dir)
                .join(format!("{}_combined.{}", stem, ext))
                .to_string_lossy()
                .to_string();

            let concat_status = silent_command(&ffmpeg_path)
                .args([
                    "-y", "-f", "concat", "-safe", "0",
                    "-i", &list_path, "-c", "copy", &combined_path,
                ])
                .stdout(Stdio::null())
                .stderr(Stdio::piped())
                .output()
                .map_err(|e| format!("Concat ffmpeg spawn error: {e}"))?;

            let _ = std::fs::remove_file(&list_path);

            if !concat_status.status.success() {
                return Err(format!(
                    "Concat failed: {}",
                    String::from_utf8_lossy(&concat_status.stderr)
                ));
            }
            return Ok(vec![combined_path]);
        }

        Ok(per_segment_paths)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn cancel_export(state: tauri::State<'_, ExportState>) -> Result<(), String> {
    state.cancel.store(true, Ordering::SeqCst);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_json() -> &'static str {
        r#"{"streams":[{"codec_type":"video","width":1280,"height":720,"avg_frame_rate":"30000/1001"},{"codec_type":"audio"}],"format":{"duration":"60.06"}}"#
    }

    #[test]
    fn parse_ffprobe_extracts_all_fields() {
        let m = parse_ffprobe_output(sample_json(), "/t.mp4").unwrap();
        assert_eq!(m.width, 1280);
        assert_eq!(m.height, 720);
        assert!((m.fps - 29.97).abs() < 0.01);
        assert!((m.duration - 60.06).abs() < 0.001);
        assert_eq!(m.path, "/t.mp4");
    }

    #[test]
    fn parse_ffprobe_errors_on_missing_video_stream() {
        let json =
            r#"{"streams":[{"codec_type":"audio"}],"format":{"duration":"10.0"}}"#;
        assert!(parse_ffprobe_output(json, "/x.mp4")
            .unwrap_err()
            .contains("No video stream"));
    }

    #[test]
    fn parse_ffprobe_errors_on_bad_json() {
        assert!(parse_ffprobe_output("not json", "/x.mp4").is_err());
    }

    #[test]
    fn parse_fraction_ntsc() {
        assert!((parse_fraction("30000/1001").unwrap() - 29.97).abs() < 0.01);
    }

    #[test]
    fn parse_fraction_zero_denominator() {
        assert!(parse_fraction("30/0").is_none());
    }

    #[test]
    fn parse_fraction_integer() {
        assert!((parse_fraction("25/1").unwrap() - 25.0).abs() < 0.001);
    }

    #[test]
    fn parse_progress_out_time_us() {
        assert_eq!(parse_progress_line("out_time_us=1500000"), Some(1.5));
    }

    #[test]
    fn parse_progress_ignores_other_keys() {
        assert_eq!(parse_progress_line("frame=42"), None);
        assert_eq!(parse_progress_line("fps=30"), None);
    }

    #[test]
    fn parse_progress_rejects_garbage() {
        assert_eq!(parse_progress_line("no-equals-sign"), None);
        assert_eq!(parse_progress_line("out_time_us=nope"), None);
    }

    #[test]
    fn build_encode_args_uses_preset_for_non_av1() {
        let opts = ExportOptions {
            output_dir: "/o".into(),
            codec: "h264".into(),
            lossless: false,
            crf: 20,
            preset: "fast".into(),
            concat: false,
        };
        let args = build_encode_args(&opts);
        assert!(args.windows(2).any(|w| w[0] == "-preset" && w[1] == "fast"));
        assert!(args.windows(2).any(|w| w[0] == "-crf" && w[1] == "20"));
        assert!(args.windows(2).any(|w| w[0] == "-c:v" && w[1] == "libx264"));
    }

    #[test]
    fn build_encode_args_skips_preset_for_av1() {
        let opts = ExportOptions {
            output_dir: "/o".into(),
            codec: "av1".into(),
            lossless: false,
            crf: 30,
            preset: "medium".into(),
            concat: false,
        };
        let args = build_encode_args(&opts);
        assert!(!args.iter().any(|a| a == "-preset"));
        assert!(args.iter().any(|a| a == "libaom-av1"));
    }

    #[test]
    fn ext_for_codec_vp9_webm() {
        assert_eq!(ext_for_codec("vp9"), "webm");
        assert_eq!(ext_for_codec("h264"), "mp4");
        assert_eq!(ext_for_codec("h265"), "mp4");
        assert_eq!(ext_for_codec("av1"), "mp4");
    }

    // --- GPU encoder helpers ---

    #[test]
    fn gpu_encoder_family_detection() {
        assert!(is_gpu_encoder("h264_nvenc"));
        assert!(is_gpu_encoder("hevc_nvenc"));
        assert!(is_gpu_encoder("av1_nvenc"));
        assert!(is_gpu_encoder("h264_qsv"));
        assert!(is_gpu_encoder("hevc_qsv"));
        assert!(is_gpu_encoder("h264_amf"));
        assert!(is_gpu_encoder("hevc_amf"));
        assert!(is_gpu_encoder("h264_videotoolbox"));
        assert!(is_gpu_encoder("hevc_videotoolbox"));
        assert!(!is_gpu_encoder("libx264"));
        assert!(!is_gpu_encoder("h264"));
        assert!(!is_gpu_encoder("av1"));
    }

    #[test]
    fn resolve_encoder_maps_logical_names() {
        assert_eq!(resolve_encoder("h264"), "libx264");
        assert_eq!(resolve_encoder("h265"), "libx265");
        assert_eq!(resolve_encoder("vp9"),  "libvpx-vp9");
        assert_eq!(resolve_encoder("av1"),  "libaom-av1");
        // GPU encoder names pass through
        assert_eq!(resolve_encoder("h264_nvenc"), "h264_nvenc");
        assert_eq!(resolve_encoder("hevc_qsv"),   "hevc_qsv");
    }

    #[test]
    fn build_encode_args_nvenc_uses_cq_no_preset() {
        let opts = ExportOptions {
            output_dir: "/o".into(),
            codec: "h264_nvenc".into(),
            lossless: false,
            crf: 18,
            preset: "medium".into(),
            concat: false,
        };
        let args = build_encode_args(&opts);
        assert!(args.windows(2).any(|w| w[0] == "-c:v" && w[1] == "h264_nvenc"));
        assert!(args.windows(2).any(|w| w[0] == "-cq"  && w[1] == "18"));
        assert!(!args.iter().any(|a| a == "-preset"));
        assert!(!args.iter().any(|a| a == "-crf"));
    }

    #[test]
    fn build_encode_args_qsv_uses_global_quality() {
        let opts = ExportOptions {
            output_dir: "/o".into(),
            codec: "h264_qsv".into(),
            lossless: false,
            crf: 20,
            preset: "medium".into(),
            concat: false,
        };
        let args = build_encode_args(&opts);
        assert!(args.windows(2).any(|w| w[0] == "-global_quality" && w[1] == "20"));
        assert!(!args.iter().any(|a| a == "-preset"));
    }

    #[test]
    fn build_encode_args_videotoolbox_uses_q() {
        let opts = ExportOptions {
            output_dir: "/o".into(),
            codec: "h264_videotoolbox".into(),
            lossless: false,
            crf: 30,
            preset: "medium".into(),
            concat: false,
        };
        let args = build_encode_args(&opts);
        assert!(args.windows(2).any(|w| w[0] == "-q:v" && w[1] == "30"));
        assert!(!args.iter().any(|a| a == "-preset"));
    }

    #[test]
    fn ext_for_codec_gpu_encoders_are_mp4() {
        assert_eq!(ext_for_codec("h264_nvenc"), "mp4");
        assert_eq!(ext_for_codec("hevc_nvenc"), "mp4");
        assert_eq!(ext_for_codec("h264_qsv"),   "mp4");
        assert_eq!(ext_for_codec("h264_videotoolbox"), "mp4");
    }

    // --- resolve_tool ---

    #[test]
    fn resolve_tool_empty_dir_returns_name() {
        assert_eq!(resolve_tool("ffmpeg", ""), "ffmpeg");
        assert_eq!(resolve_tool("ffprobe", ""), "ffprobe");
    }

    #[test]
    fn resolve_tool_with_dir_joins_path() {
        let expected = std::path::Path::new("/usr/local/bin")
            .join("ffmpeg")
            .to_string_lossy()
            .into_owned();
        assert_eq!(resolve_tool("ffmpeg", "/usr/local/bin"), expected);
    }

    // --- validate_media_path ---

    #[test]
    fn validate_path_rejects_empty() {
        assert!(validate_media_path("").is_err());
    }

    #[test]
    fn validate_path_rejects_flag_prefix() {
        assert!(validate_media_path("-i").is_err());
        assert!(validate_media_path("--input").is_err());
    }

    #[test]
    fn validate_path_rejects_newline() {
        assert!(validate_media_path("file\nwith\nnewline").is_err());
    }

    #[test]
    fn validate_path_rejects_null_byte() {
        let p = "file\0null";
        assert!(validate_media_path(p).is_err());
    }

    #[test]
    fn validate_path_accepts_normal_paths() {
        assert!(validate_media_path("/home/user/video.mp4").is_ok());
        assert!(validate_media_path("C:\\Users\\user\\video.mp4").is_ok());
        assert!(validate_media_path("C:/Users/user/video.mp4").is_ok());
        assert!(validate_media_path("/path/with spaces/video.mp4").is_ok());
    }
}
