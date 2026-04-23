use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VideoMetadata {
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub id: String,
    pub in_point: f64,
    pub out_point: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    pub output_dir: String,
    pub codec: String,
    pub lossless: bool,
    #[serde(default = "default_crf")]
    pub crf: u32,
    #[serde(default = "default_preset")]
    pub preset: String,
    #[serde(default)]
    pub concat: bool,
}

fn default_crf() -> u32 { 23 }
fn default_preset() -> String { "medium".into() }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolsStatus {
    pub ffmpeg: bool,
    pub ffprobe: bool,
}

use std::sync::Arc;
use std::sync::atomic::AtomicBool;

pub struct ExportState {
    pub cancel: Arc<AtomicBool>,
}

impl Default for ExportState {
    fn default() -> Self {
        Self {
            cancel: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn video_metadata_roundtrips_json() {
        let meta = VideoMetadata {
            duration: 42.5,
            width: 1920,
            height: 1080,
            fps: 29.97,
            path: "/tmp/t.mp4".into(),
        };
        let decoded: VideoMetadata =
            serde_json::from_str(&serde_json::to_string(&meta).unwrap()).unwrap();
        assert_eq!(meta, decoded);
    }

    #[test]
    fn segment_roundtrips_json() {
        let seg = Segment {
            id: "s1".into(),
            in_point: 1.0,
            out_point: 5.5,
        };
        let decoded: Segment =
            serde_json::from_str(&serde_json::to_string(&seg).unwrap()).unwrap();
        assert_eq!(seg, decoded);
    }

    #[test]
    fn export_options_lossless() {
        let opts = ExportOptions {
            output_dir: "/tmp".into(),
            codec: "h264".into(),
            lossless: true,
            crf: 23,
            preset: "medium".into(),
            concat: false,
        };
        assert!(opts.lossless);
    }

    #[test]
    fn export_options_applies_defaults() {
        let json = r#"{"outputDir":"/tmp","codec":"h264","lossless":false}"#;
        let opts: ExportOptions = serde_json::from_str(json).unwrap();
        assert_eq!(opts.crf, 23);
        assert_eq!(opts.preset, "medium");
        assert!(!opts.concat);
    }
}
