using System.IO;
using System.Text.Json;

namespace Spector.Model.IO;

public abstract class RepositoryBase<T> where T : class
{
    // ReSharper disable once StaticMemberInGenericType
    private static readonly AsyncLock Lock = new();
    protected async Task<T> LoadAsync(FileInfo fileInfo, Func<T> getDefault)
    {
        using (await Lock.LockAsync())
        {
            return await LoadInnerAsync();
            async Task<T> LoadInnerAsync()
            {
                if (fileInfo.Exists is false)
                {
                    await SaveInnerAsync(fileInfo, getDefault());
                }

                try
                {
                    await using var stream = new FileStream(fileInfo.FullName, FileMode.Open, FileAccess.Read);
                    return (await JsonSerializer.DeserializeAsync<T>(stream, JsonEnvironments.Options))!;
                }
                catch
                {
                    fileInfo.Delete();
                    return await LoadInnerAsync();
                }
            }
        }
    }
    
    protected async Task SaveAsync(FileInfo fileInfo, T value)
    {
        using (await Lock.LockAsync())
        {
            await SaveInnerAsync(fileInfo, value);
        }
    }

    private async Task SaveInnerAsync(FileInfo fileInfo, T value)
    {
        if (fileInfo.Exists)
        {
            fileInfo.Delete();
        }

        await using var stream = new FileStream(fileInfo.FullName, FileMode.Create, FileAccess.Write);
        await JsonSerializer.SerializeAsync(stream, value, JsonEnvironments.Options);
        stream.Flush();
        stream.Close();
    }
}