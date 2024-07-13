using UnitGenerator;

namespace Spector.Model;

#region Decibel
[UnitOf<double>(UnitGenerateOptions.Comparable | UnitGenerateOptions.JsonConverter)]
public partial struct Decibel
{
    public static readonly double MinimumValue = -84d;
    public static readonly double MaximumValue = 0d;

    /// <summary>
    /// 最小値
    /// </summary>
    public static readonly Decibel Minimum = new(MinimumValue);

    /// <summary>
    /// 最大値
    /// </summary>
    public static readonly Decibel Maximum = new(MaximumValue);
}
#endregion

#region Direction
public enum Direction
{
    Front,
    Right,
    Rear,
    Left
}
#endregion

#region RemoteCommand
public enum RemoteCommand
{
    StartPlayLooping,
    StopPlayLooping,
}
#endregion

#region VolumeLevel
/// <summary>
/// 入出力レベル
/// </summary>
[UnitOf<float>(
    UnitGenerateOptions.Comparable | UnitGenerateOptions.Validate | UnitGenerateOptions.ArithmeticOperator | UnitGenerateOptions.JsonConverter)]
public readonly partial struct VolumeLevel
{
    /// <summary>
    /// 最小値
    /// </summary>
    private const float MinimumValue = 0f;
    /// <summary>
    /// 最大値
    /// </summary>
    private const float MaximumValue = 1.0f;

    /// <summary>
    /// 最小値
    /// </summary>
    public static readonly VolumeLevel Minimum = new(MinimumValue);
    /// <summary>
    /// 最大値
    /// </summary>
    public static readonly VolumeLevel Maximum = new(MaximumValue);

    /// <summary>
    /// 検証する
    /// </summary>
    /// <exception cref="Exception"></exception>
    private partial void Validate()
    {
        if (value < MinimumValue || MaximumValue < value)
        {
            throw new Exception("Invalid value range: " + value);
        }
    }
}
#endregion
