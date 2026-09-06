namespace MatchZyCoach;

public enum CoachFocus
{
    Mechanics,
    Utility,
    Decisions,
    Match
}

public sealed class CoachSession
{
    public required string Id { get; init; }
    public required ulong SteamId { get; init; }
    public required string PlayerName { get; init; }
    public required CoachFocus Focus { get; init; }
    public required string Map { get; init; }
    public required DateTimeOffset StartedAt { get; init; }
    public int Rounds { get; set; }
    public int Shots { get; set; }
    public int ShotsHit { get; set; }
    public int ShotsWhileMoving { get; set; }
    public int BurstCount { get; set; }
    public int BurstShots { get; set; }
    public int LongBursts { get; set; }
    public int CurrentBurst { get; set; }
    public long LastShotAtMs { get; set; }
    public bool LastShotHit { get; set; }
    public string LastWeapon { get; set; } = "";
    public int Kills { get; set; }
    public int FirearmKills { get; set; }
    public int Headshots { get; set; }
    public int Deaths { get; set; }
    public int Damage { get; set; }
    public int OpeningKills { get; set; }
    public int OpeningDeaths { get; set; }
    public int TradeKills { get; set; }
    public int DeathsTraded { get; set; }
    public int GrenadesThrown { get; set; }
    public int UtilityDamage { get; set; }
    public int EnemiesFlashed { get; set; }
    public float EnemyFlashSeconds { get; set; }
    public int TeammatesFlashed { get; set; }
    public float TeamFlashSeconds { get; set; }
    public List<int> TimeToKillSamplesMs { get; } = [];
    public Dictionary<int, long> FirstDamageAtMs { get; } = [];
    public List<string> Notes { get; } = [];

    public void FinishBurst()
    {
        if (CurrentBurst == 0) return;
        BurstCount++;
        BurstShots += CurrentBurst;
        if (CurrentBurst >= 8) LongBursts++;
        CurrentBurst = 0;
    }
}

public sealed record CoachFeedback(string Code, string Title, string Detail);

public sealed record CoachSessionResult(
    int SchemaVersion,
    string Id,
    string SteamId,
    string PlayerName,
    string Focus,
    string Map,
    DateTimeOffset StartedAt,
    DateTimeOffset EndedAt,
    int DurationSeconds,
    string EndReason,
    int Rounds,
    int Shots,
    int ShotsHit,
    double ShotAccuracy,
    int ShotsWhileMoving,
    double MovingShotRate,
    int BurstCount,
    double AverageBurstLength,
    int LongBursts,
    int Kills,
    int FirearmKills,
    int Headshots,
    double HeadshotRate,
    int Deaths,
    int Damage,
    int OpeningKills,
    int OpeningDeaths,
    int TradeKills,
    int DeathsTraded,
    int GrenadesThrown,
    int UtilityDamage,
    int EnemiesFlashed,
    double EnemyFlashSeconds,
    int TeammatesFlashed,
    double TeamFlashSeconds,
    int TimeToKillSamples,
    int? AverageTimeToKillMs,
    IReadOnlyList<string> Notes,
    IReadOnlyList<CoachFeedback> Feedback
);
