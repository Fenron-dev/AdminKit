//go:build !windows

package diskscan

import (
	"io/fs"
	"syscall"
)

// allocSize liefert den belegten Platz (Blöcke × 512) wie du – bei
// komprimierten/sparse Dateien ehrlicher als die logische Größe.
func allocSize(info fs.FileInfo) int64 {
	if st, ok := info.Sys().(*syscall.Stat_t); ok && st.Blocks > 0 {
		return int64(st.Blocks) * 512
	}
	return info.Size()
}

// VolumeSpace liefert Gesamt- und freien Platz des Volumes von path.
func VolumeSpace(path string) (total, free int64, err error) {
	var s syscall.Statfs_t
	if err := syscall.Statfs(path, &s); err != nil {
		return 0, 0, err
	}
	return int64(s.Blocks) * int64(s.Bsize), int64(s.Bavail) * int64(s.Bsize), nil
}
