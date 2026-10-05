using Playbook;
using Xunit;

namespace Playbook.Tests;

public sealed class GrenadeRethrowTests
{
    private static GrenadeRethrow Throw(string name = "smokegrenade_projectile") =>
        new(name, new(1, 2, 3), new(4, 5, 6), new(100, 200, 300), new(7, 8, 9), 45);

    [Fact]
    public void KeepsEachPlayersLatestRealThrowIncludingLaunchAndSpin()
    {
        var history = new GrenadeRethrowHistory();
        var smoke = Throw();
        var fire = Throw("molotov_projectile") with { ItemIndex = 48, Incendiary = true };
        Assert.Null(history.Last(1));
        history.Remember(1, smoke);
        history.Remember(2, fire);
        history.Remember(1, Throw("flashbang_projectile"), GrenadeRethrowHistory.Marker);
        Assert.Equal(smoke, history.Last(1));
        Assert.Equal(fire, history.Last(2));
        history.Remember(1, fire);
        Assert.Equal(fire, history.Last(1));
    }

    [Fact]
    public void RejectsInvalidLaunchesWithoutLosingTheLastValidThrow()
    {
        var history = new GrenadeRethrowHistory();
        var valid = Throw();
        history.Remember(1, valid);
        history.Remember(1, valid with { Velocity = new(0, 0, 0) });
        history.Remember(1, valid with { Position = new(float.NaN, 0, 0) });
        history.Remember(1, valid with { Velocity = new(0, float.PositiveInfinity, 0) });
        Assert.Equal(valid, history.Last(1));
    }

    [Fact]
    public void ReportsRejectedLaunchAndPreservesPreviousThrow()
    {
        var history = new GrenadeRethrowHistory();
        var valid = Throw();
        Assert.True(history.TryRemember(1, valid, out var accepted));
        Assert.Equal("", accepted);
        Assert.False(history.TryRemember(1, valid with { Velocity = new(0, 0, 0) }, out var zero));
        Assert.Equal("Geschwindigkeit ist null", zero);
        Assert.False(history.TryRemember(1, valid with { Position = new(float.NaN, 0, 0) }, out var position));
        Assert.Equal("ungültige Position", position);
        Assert.False(history.TryRemember(1, valid, out var synthetic, GrenadeRethrowHistory.Marker));
        Assert.Equal("synthetischer Wiederholungswurf", synthetic);
        Assert.Equal(valid, history.Last(1));
    }

    [Fact]
    public void DisconnectAndMapResetRemoveStoredThrows()
    {
        var history = new GrenadeRethrowHistory();
        history.Remember(1, Throw());
        history.Remember(2, Throw());
        history.Forget(1);
        Assert.Null(history.Last(1));
        Assert.NotNull(history.Last(2));
        history.Clear();
        Assert.Null(history.Last(2));
    }
}
