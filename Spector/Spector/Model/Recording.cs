using System.Collections.Concurrent;
using System.IO;
using System.Runtime.InteropServices;
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
            .Select(x => new RecordingByDevice(x, GetRecordFileInfo(CurrentRecordDirectory, x)))
            .ToArray();
    }

    private DirectoryInfo CurrentRecordDirectory { get; }
    private bool WithVoice { get; }
    private bool WithBuzz { get; }

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
        foreach (var device in RecorderByDevices)
        {
            device.StopRecording();
        }
    }

    static FileInfo GetRecordFileInfo(DirectoryInfo directoryInfo, IDevice device)
    {
        // ファイル名に利用できない文字を取得
        var invalidChars = Path.GetInvalidFileNameChars();

        var fileName = device.Name + ".wav";
        // ファイル名の無効な文字をアンダースコアに置き換える
        fileName = invalidChars
            .Aggregate(fileName, (current, c) => current.Replace(c, '_'));

        return new FileInfo(Path.Combine(directoryInfo.FullName, fileName));
    }


    private class RecordingByDevice(IDevice device, FileInfo file) : IDisposable
    {
        private BlockingCollection<byte[]> BufferQueue { get; } = [];
        private bool IsRecording { get; set; }

        private WaveFileWriter? Writer { get; set; }


        public void StartRecording()
        {
            if (IsRecording) return;

            IsRecording = true;

            Writer = new WaveFileWriter(file.FullName, device.WaveFormat);

            device.DataAvailable += (s, e) =>
            {
                byte[] buffer = new byte[e.BytesRecorded];
                Array.Copy(e.Buffer, buffer, e.BytesRecorded);

                if (IsRecording is false) return;

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

        public void StopRecording()
        {
            if (IsRecording is false) return;

            IsRecording = false;
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
    }
}