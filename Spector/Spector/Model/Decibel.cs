using UnitGenerator;

namespace Spector.Model;

[UnitOf<double>(UnitGenerateOptions.Comparable)]
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