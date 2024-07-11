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
                new (
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
                    []));

    /// <summary>
    /// Settingsを保存する。
    /// </summary>
    /// <param name="settings"></param>
    /// <returns></returns>
    public Task SaveAsync(Settings settings) => SaveAsync(FileInfo, settings);
}