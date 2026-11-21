// Package hashing berechnet Prüfsummen von Dateien als Stream – auch für
// mehrere Gigabyte große ISOs, ohne die Datei in den Speicher zu laden.
package hashing

import (
	"context"
	"crypto/md5"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/hex"
	"fmt"
	"hash"
	"io"
	"os"
	"strings"
)

// Supported sind die Verfahren in der Reihenfolge der Anzeige.
var Supported = []string{"SHA-256", "SHA-1", "SHA-512", "MD5"}

func newHash(name string) (hash.Hash, error) {
	switch strings.ToUpper(name) {
	case "SHA-256", "SHA256":
		return sha256.New(), nil
	case "SHA-1", "SHA1":
		return sha1.New(), nil
	case "SHA-512", "SHA512":
		return sha512.New(), nil
	case "MD5":
		return md5.New(), nil
	}
	return nil, fmt.Errorf("unbekanntes Verfahren %q", name)
}

// File berechnet die Prüfsummen einer Datei. progress (optional) erhält die
// gelesenen Bytes und die Gesamtgröße. Abbruch über ctx.
func File(ctx context.Context, path string, algos []string, progress func(done, total int64)) (map[string]string, error) {
	if len(algos) == 0 {
		algos = Supported
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if st.IsDir() {
		return nil, fmt.Errorf("%s ist ein Ordner", path)
	}
	hs := map[string]hash.Hash{}
	ws := make([]io.Writer, 0, len(algos))
	for _, a := range algos {
		h, err := newHash(a)
		if err != nil {
			return nil, err
		}
		hs[a] = h
		ws = append(ws, h)
	}
	w := io.MultiWriter(ws...)
	buf := make([]byte, 1<<20)
	var done int64
	for {
		if err := ctx.Err(); err != nil {
			return nil, fmt.Errorf("abgebrochen")
		}
		n, rerr := f.Read(buf)
		if n > 0 {
			_, _ = w.Write(buf[:n])
			done += int64(n)
			if progress != nil {
				progress(done, st.Size())
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			return nil, rerr
		}
	}
	out := make(map[string]string, len(hs))
	for a, h := range hs {
		out[a] = hex.EncodeToString(h.Sum(nil))
	}
	return out, nil
}
