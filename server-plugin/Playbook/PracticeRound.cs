namespace Playbook;

public static class PracticeRound
{
    // Warmup and scheduled restarts own their timers. Only shorten the actual
    // round freeze, so joining never rewinds a running training round.
    public static bool FinishFreeze(bool warmup, bool freeze, bool restartPending, float now,
        ref int freezeTime, ref int roundTime, ref float roundStartTime)
    {
        if (warmup || !freeze || restartPending) return false;
        if (freezeTime == 0 && roundTime > 0 && roundStartTime < now) return false;
        freezeTime = 0;
        // Keep a live round duration: setting it to zero would leave the clock
        // at 0:00 even after the engine releases the freeze period.
        roundTime = 60 * 60;
        roundStartTime = now - 1f;
        return true;
    }
}
