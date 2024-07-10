using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Unicode;

namespace Spector;

/// <summary>
/// JSON関連の環境設定
/// </summary>
public static class JsonEnvironments
{
    /// <summary>
    /// JSONオプション
    /// </summary>
    public static JsonSerializerOptions Options => new()
    {
        Encoder = JavaScriptEncoder.Create(UnicodeRanges.All),
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

}