namespace Spector.Model;

public record CalibrationPoint(
    Decibel Criterion,
    string Example,
    VolumeLevel VolumeLevel,
    Decibel Decibel);