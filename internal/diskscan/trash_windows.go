package diskscan

import (
	"context"
	"os"
	"strings"
	"time"

	"adminkit/internal/execx"
)

// moveToTrash verschiebt über die Shell-API in den Papierkorb (wiederherstellbar).
func moveToTrash(path string) error {
	fi, err := os.Stat(path)
	if err != nil {
		return err
	}
	fn := "DeleteFile"
	if fi.IsDir() {
		fn = "DeleteDirectory"
	}
	lit := "'" + strings.ReplaceAll(path, "'", "''") + "'"
	script := "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::" + fn +
		"(" + lit + ", 'OnlyErrorDialogs', 'SendToRecycleBin')"
	_, err = execx.Output(context.Background(), 5*time.Minute, "powershell", "-NoProfile", "-NonInteractive", "-Command", script)
	return err
}
