using NAudio.Wave;
using UnitGenerator;

namespace Spector.Model;

public record RecordingConfig(
    WaveFormat WaveFormat,
    TimeSpan RecordingSpan,
    RefreshRate RefreshRate)
{
    public static readonly RecordingConfig Default =
        new(new(48_000, 16, 1), TimeSpan.FromMinutes(2), new RefreshRate(40));

    public int RecordingLength => (int)(RecordingSpan / RefreshRate.Interval);
}

[UnitOf<int>]
public partial struct RefreshRate
{
    public TimeSpan Interval => TimeSpan.FromSeconds(1f / value);
}