namespace Spector.Model;

public class DeviceConfig(
    DeviceId id,
    string name,
    bool measure)
{
    /// <summary>
    /// ID
    /// </summary>
    public DeviceId Id { get; } = id;

    /// <summary>
    /// 名称
    /// </summary>
    public string Name { get; set; } = name;

    /// <summary>
    /// 計測するか、しないか取得する。
    /// </summary>
    public bool Measure { get; set; } = measure;
}