//go:build !darwin && !windows

package quickactions

func RunFix(fixID string) Result {
	return Result{Action: fixID, Output: "Nicht unterstützt auf diesem Betriebssystem.", Success: false}
}

func RunQuickAction(actionID string) Result {
	return Result{Action: actionID, Output: "Nicht unterstützt auf diesem Betriebssystem.", Success: false}
}
