//go:build windows

package diskscan

import (
	"io/fs"

	"golang.org/x/sys/windows"
)

func allocSize(info fs.FileInfo) int64 { return info.Size() }

// VolumeSpace liefert Gesamt- und freien Platz des Laufwerks von path.
func VolumeSpace(path string) (total, free int64, err error) {
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return 0, 0, err
	}
	var freeAvail, tot, totFree uint64
	if err := windows.GetDiskFreeSpaceEx(p, &freeAvail, &tot, &totFree); err != nil {
		return 0, 0, err
	}
	return int64(tot), int64(freeAvail), nil
}
