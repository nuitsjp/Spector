using System.IO;

namespace Spector.Model;

public record RecordByDevice(
    DeviceId Id,
    string Name,
    string SystemName,
    Direction Direction,
    bool WithVoice,
    bool WithBuzz,
    VolumeLevel VolumeLevel,
    Decibel Min,
    Decibel Avg,
    Decibel Max,
    double Minus30db,
    double Minus40db,
    double Minus50db)
{
    public string FileName => ToFileName(Name);

    public static string ToFileName(string name)
    {
        var fileName = $"{name}.wav";
        // ファイル名の無効な文字をアンダースコアに置き換える
        return Path.GetInvalidFileNameChars()
            .Aggregate(fileName, (current, c) => current.Replace(c, '_'));
    }
}