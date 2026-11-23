package capture

import (
	"context"
	"testing"
)

func TestRecorderStopWithoutStart(t *testing.T) {
	var r Recorder
	if _, err := r.Stop(); err == nil {
		t.Error("Stop ohne Aufnahme muss fehlschlagen")
	}
}

func TestToGIFNeedsFFmpeg(t *testing.T) {
	if err := ToGIF(context.Background(), "/nicht/vorhanden/ffmpeg", "a.mp4", "b.gif", 0, 0, 10); err == nil {
		t.Error("fehlendes ffmpeg nicht gemeldet")
	}
}
