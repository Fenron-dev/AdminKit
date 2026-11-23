package system

import "testing"

func TestCleanSerial(t *testing.T) {
	for in, want := range map[string]string{" ABC1234 ": "ABC1234", "To be filled by O.E.M.": "", "Default string": "", "0": ""} {
		if got := cleanSerial(in); got != want {
			t.Errorf("%q → %q, erwartet %q", in, got, want)
		}
	}
}
