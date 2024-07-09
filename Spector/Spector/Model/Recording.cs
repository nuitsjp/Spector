using System.Collections.Concurrent;
using System.IO;
using NAudio.Wave;

namespace Spector.Model;

public class Recording
{
    internal Recording(
        DirectoryInfo recordRootDirectory, 
        bool withVoice, 
        bool withBuzz,
        IEnumerable<IDevice> devices)
    {
        // ReSharper disable once StringLiteralTypo
        CurrentRecordDirectory =
            new DirectoryInfo(Path.Combine(recordRootDirectory.FullName, DateTime.Now.ToString("yyyyMMdd-HHmmss")))
                .CreateIfNotExists(); 
        WithVoice = withVoice;
        WithBuzz = withBuzz;
        RecorderByDevices = devices
            .Select(x => new RecordingByDevice(x, CurrentRecordDirectory, CancellationTokenSource.Token))
            .ToArray();
    }

    private DirectoryInfo CurrentRecordDirectory { get; }
    private bool WithVoice { get; }
    private bool WithBuzz { get; }
    private CancellationTokenSource CancellationTokenSource { get; } = new();

    /// <summary>
    /// 録音中のデバイス
    /// </summary>
    private IReadOnlyList<RecordingByDevice> RecorderByDevices { get; }

    internal void StartRecording()
    {
        foreach (var device in RecorderByDevices)
        {
            device.StartRecording();
        }
    }

    public void StopRecording()
    {
        CancellationTokenSource.Cancel();
    }

    private class RecordingByDevice(
        IDevice device, 
        DirectoryInfo directory,
        CancellationToken cancellationToken) : IDisposable
    {
        private BlockingCollection<byte[]> BufferQueue { get; } = [];

        private WaveFileWriter? Writer { get; set; }


        public void StartRecording()
        {
            cancellationToken.Register(StopRecording);

            Writer = new WaveFileWriter(GetRecordFileInfo().FullName, device.WaveFormat);

            device.DataAvailable += (s, e) =>
            {
                byte[] buffer = new byte[e.BytesRecorded];
                Array.Copy(e.Buffer, buffer, e.BytesRecorded);

                if (cancellationToken.IsCancellationRequested) return;

                try
                {
                    BufferQueue.Add(buffer);
                }
                catch
                {
                    // すれ違いでStopRecordingが呼ばれた場合、例外が発生するが無視する
                }
            };

            Task.Run(ProcessQueue);
        }

        private void StopRecording()
        {
            BufferQueue.CompleteAdding();
        }

        private void ProcessQueue()
        {
            try
            {
                foreach (var buffer in BufferQueue.GetConsumingEnumerable())
                {
                    // データの処理
                    Writer?.Write(buffer, 0, buffer.Length);
                }
            }
            finally
            {
                Writer?.Flush();
                Writer?.Dispose();
            }
        }

        public void Dispose()
        {
        }

        private FileInfo GetRecordFileInfo()
        {
            // ファイル名に利用できない文字を取得
            var invalidChars = Path.GetInvalidFileNameChars();

            var fileName = device.Name + ".wav";
            // ファイル名の無効な文字をアンダースコアに置き換える
            fileName = invalidChars
                .Aggregate(fileName, (current, c) => current.Replace(c, '_'));

            return new FileInfo(Path.Combine(directory.FullName, fileName));
        }
    }
}
