using System.Collections.Concurrent;
using System.IO;
using NAudio.Wave;

namespace Spector.Model;

public class RecordingByDevice(
    IDevice device,
    DirectoryInfo directory) : IDisposable
{
    private BlockingCollection<byte[]> BufferQueue { get; } = [];

    private WaveFileWriter? Writer { get; set; }

    private string FilePath => Path.Combine(directory.FullName, RecordByDevice.ToFileName(device.Name));

    private bool IsStopped { get; set; } = true;

    public void StartRecording()
    {
        IsStopped = false;

        Writer = new WaveFileWriter(FilePath, device.WaveFormat);

        device.DataAvailable += (_, e) =>
        {
            var buffer = new byte[e.BytesRecorded];
            Array.Copy(e.Buffer, buffer, e.BytesRecorded);

            if (IsStopped) return;

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
        IsStopped = true;
        BufferQueue.CompleteAdding();

        Writer?.Flush();
        Writer?.Dispose();
    }

    private void ProcessQueue()
    {
        foreach (var buffer in BufferQueue.GetConsumingEnumerable())
        {
            if (IsStopped) break;

            // データの処理
            Writer?.Write(buffer, 0, buffer.Length);
        }
    }

    public RecordByDevice ToRecord()
    {
        var levels = WaveFileAnalyzer.Analyze(FilePath).ToArray();
        return levels.Any()
            ? new RecordByDevice(
                device.Id,
                device.Name,
                device.SystemName,
                levels.Min(),
                new Decibel(levels.Average(x => x.AsPrimitive())),
                levels.Max(),
                (double)levels.Count(x => -30d < x.AsPrimitive()) / levels.Length,
                (double)levels.Count(x => -40d < x.AsPrimitive()) / levels.Length,
                (double)levels.Count(x => -50d < x.AsPrimitive()) / levels.Length)
            : new RecordByDevice(
                device.Id,
                device.Name,
                device.SystemName,
                Decibel.Minimum,
                Decibel.Minimum,
                Decibel.Minimum,
                0,
                0,
                0);
    }

    public void Dispose()
    {
    }
}