namespace Playbook;

public static class TrainingBotClaim
{
    public sealed record Candidate(uint Handle, int Team, bool Alive);

    // A controller can arrive before its pawn or on the other team. Wait for
    // a living bot on the requested team instead of claiming an arbitrary bot.
    public static uint? Select(IEnumerable<Candidate> candidates, int team) =>
        candidates.FirstOrDefault(bot => bot.Team == team && bot.Alive)?.Handle;
}
