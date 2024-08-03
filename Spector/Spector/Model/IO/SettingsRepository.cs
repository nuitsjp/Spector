using System.IO;

namespace Spector.Model.IO;

/// <summary>
/// Settingsのリポジトリー
/// </summary>
public class SettingsRepository : RepositoryBase<Settings>, ISettingsRepository
{
    private static readonly FileInfo FileInfo = new($"{nameof(Settings)}.json");

    /// <summary>
    /// Settingsをロードする。
    /// </summary>
    /// <returns></returns>
    public Task<Settings> LoadAsync() =>
        LoadAsync(
            FileInfo,
            () =>
                new(
                    "localhost",
                    null,
                    null,
                    true,
                    true,
                    new(
                        TimeSpan.FromSeconds(30),

                        "Record",
                        false,
                        true),
                    [],
                    [
                        new CalibrationPoint((Decibel)40, "図書館、静かなささやき", (VolumeLevel)0.4, (Decibel)40),
                        new CalibrationPoint((Decibel)50, "静かなオフィス", (VolumeLevel)0.45, (Decibel)50),
                        new CalibrationPoint((Decibel)60, "通常の会話", (VolumeLevel)0.5, (Decibel)60),
                        new CalibrationPoint((Decibel)70, "にぎやかなレストラン、掃除機", (VolumeLevel)0.55, (Decibel)70),
                        new CalibrationPoint((Decibel)75, string.Empty, (VolumeLevel)0.6, (Decibel)75)
                    ]));

    /// <summary>
    /// Settingsを保存する。
    /// </summary>
    /// <param name="settings"></param>
    /// <returns></returns>
    public Task SaveAsync(Settings settings) => SaveAsync(FileInfo, settings);
}