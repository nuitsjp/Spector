using System.Collections.Concurrent;
using System.IO;
using System.Runtime.InteropServices;
using NAudio.Wave;

namespace Spector.Model;

public class Recorder
{
    /// <summary>
    /// 録音中のデバイス
    /// </summary>
    private List<RecorderByDevice> RecorderByDevices { get; } = [];

    public void StartRecording(DirectoryInfo directoryInfo, IEnumerable<IDevice> devices)
    {
        // ReSharper disable once StringLiteralTypo
        var currentRecordDirectory =
            new DirectoryInfo(Path.Combine(directoryInfo.FullName, DateTime.Now.ToString("yyyyMMdd-HHmmss")))
                .CreateIfNotExists();

        foreach (var device in devices)
        {
            RecorderByDevice recorder = new(device);
            recorder.StartRecording(GetRecordFileInfo(currentRecordDirectory, device));
            RecorderByDevices.Add(recorder);
        }
    }

    public void StopRecording()
    {
        foreach (var device in RecorderByDevices)
        {
            device.StopRecording();
        }
        RecorderByDevices.Clear();
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


    private class RecorderByDevice(IDevice device) : IDisposable
    {
        private BlockingCollection<byte[]> BufferQueue { get; } = [];
        private bool IsRecording { get; set; }

        private WaveFileWriter? Writer { get; set; }


        public void StartRecording(FileInfo file)
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