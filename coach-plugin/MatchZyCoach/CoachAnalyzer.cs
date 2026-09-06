namespace MatchZyCoach;

public static class CoachAnalyzer
{
    public static CoachSessionResult Complete(CoachSession session, DateTimeOffset endedAt, string reason)
    {
        session.FinishBurst();
        var shotAccuracy = Ratio(session.ShotsHit, session.Shots);
        var movingRate = Ratio(session.ShotsWhileMoving, session.Shots);
        var headshotRate = Ratio(session.Headshots, session.FirearmKills);
        var averageBurst = session.BurstCount == 0 ? 0 : (double)session.BurstShots / session.BurstCount;
        var averageTtk = session.TimeToKillSamplesMs.Count == 0
            ? null
            : (int?)Math.Round(session.TimeToKillSamplesMs.Average());
        var feedback = BuildFeedback(session, shotAccuracy, movingRate, headshotRate, averageBurst);

        return new CoachSessionResult(
            1,
            session.Id,
            session.SteamId.ToString(),
            session.PlayerName,
            session.Focus.ToString().ToLowerInvariant(),
            session.Map,
            session.StartedAt,
            endedAt,
            Math.Max(0, (int)Math.Round((endedAt - session.StartedAt).TotalSeconds)),
            reason,
            session.Rounds,
            session.Shots,
            session.ShotsHit,
            shotAccuracy,
            session.ShotsWhileMoving,
            movingRate,
            session.BurstCount,
            averageBurst,
            session.LongBursts,
            session.Kills,
            session.FirearmKills,
            session.Headshots,
            headshotRate,
            session.Deaths,
            session.Damage,
            session.OpeningKills,
            session.OpeningDeaths,
            session.TradeKills,
            session.DeathsTraded,
            session.GrenadesThrown,
            session.UtilityDamage,
            session.EnemiesFlashed,
            Math.Round(session.EnemyFlashSeconds, 1),
            session.TeammatesFlashed,
            Math.Round(session.TeamFlashSeconds, 1),
            session.TimeToKillSamplesMs.Count,
            averageTtk,
            session.Notes,
            feedback
        );
    }

    private static List<CoachFeedback> BuildFeedback(CoachSession session, double accuracy, double movingRate, double headshotRate, double averageBurst)
    {
        var feedback = new List<CoachFeedback>();

        if (session.Focus == CoachFocus.Utility)
        {
            if (session.GrenadesThrown < 6)
                feedback.Add(new("utility-volume", "Repeat fewer lineups more often", $"You threw {session.GrenadesThrown} grenades. Pick three lineups and land each one three times from memory."));
            if (session.TeammatesFlashed > 0)
                feedback.Add(new("team-flash", "Call the flash before it pops", $"Teammates were caught {session.TeammatesFlashed} times for {session.TeamFlashSeconds:0.0} seconds in total."));
        }
        else
        {
            if (session.Focus is CoachFocus.Decisions or CoachFocus.Match && session.OpeningDeaths > session.OpeningKills)
                feedback.Add(new("opening", "Change the first duel", $"Opening record: {session.OpeningKills} won, {session.OpeningDeaths} lost. Use utility, a teammate or a different timing before taking the same first fight."));

            if (session.Focus is CoachFocus.Decisions or CoachFocus.Match && session.Deaths >= 4 && Ratio(session.DeathsTraded, session.Deaths) < 0.25)
                feedback.Add(new("trades", "Die where a teammate can answer", $"{session.DeathsTraded} of {session.Deaths} deaths were traded within five seconds. Shorten the gap to your nearest teammate before the next contact."));

            if (session.Shots >= 20 && movingRate >= 0.2)
                feedback.Add(new("movement", "Set your feet before the duel", $"{Percent(movingRate)} of measured shots left the barrel above 50 units/s. Repeat short counter-strafe bursts until that stays below 20%."));

            if (session.Shots >= 20 && accuracy < 0.25)
                feedback.Add(new("accuracy", "Give the first bullet more time", $"{Percent(accuracy)} of measured firearm shots produced damage. Reduce pace and only speed up after two clean sets."));

            if (session.BurstCount >= 5 && (averageBurst > 6 || session.LongBursts >= 3))
                feedback.Add(new("burst", "Reset long sprays sooner", $"Your average burst was {averageBurst:0.0} shots and {session.LongBursts} bursts reached eight shots. Break contact or reset the spray after the first miss."));

            if (session.FirearmKills >= 5 && headshotRate < 0.35)
                feedback.Add(new("head", "Keep the correction on the head line", $"{Percent(headshotRate)} of firearm kills were headshots. Slow the final correction instead of accepting the body shot."));
        }

        if (feedback.Count == 0)
            feedback.Add(new("baseline", "Build another comparable sample", "No strong weakness crossed the coaching thresholds. Repeat the same focus and map once more before changing the routine."));

        return feedback.Take(3).ToList();
    }

    private static double Ratio(int value, int total) => total <= 0 ? 0 : Math.Clamp((double)value / total, 0, 1);
    private static string Percent(double value) => $"{value * 100:0}%";
}
