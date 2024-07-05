using System.IO;

namespace Spector;

public static class DirectoryInfoExtensions
{
    public static DirectoryInfo CreateIfNotExists(this DirectoryInfo directoryInfo)
    {
        if (directoryInfo.Exists is false)
        {
            directoryInfo.Create();
        }

        return directoryInfo;
    }
}