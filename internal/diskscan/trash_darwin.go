package diskscan

import (
	"context"
	"strings"
	"time"

	"adminkit/internal/execx"
)

// moveToTrash verschiebt über den Finder in den Papierkorb („Zurücklegen“ möglich).
func moveToTrash(path string) error {
	esc := strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(path)
	_, err := execx.Output(context.Background(), 60*time.Second, "osascript", "-e",
		`tell application "Finder" to delete (POSIX file "`+esc+`" as alias)`)
	return err
}
