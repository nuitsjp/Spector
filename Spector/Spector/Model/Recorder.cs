using System.IO;
using System.Text.Json;
using NAudio.Wave;
using Reactive.Bindings;

namespace Spector.Model;

public class Recorder
{
    private ISettingsRepository SettingsRepository { get; }
    private Recording? Recording { get; set; }
    private readonly ReactiveCollection<Record> _records = [];
    public ReadOnlyReactiveCollection<Record> Records { get; }
    public DirectoryInfo RootDirectory { get; } = new("Record");


    public Recorder(ISettingsRepository settingsRepository)
    {
        SettingsRepository = settingsRepository;
        Records = _records.ToReadOnlyReactiveCollection();
    }

    public async Task ActivateAsync()
    {
        // RootDirectoryの下の拡張子がjsonのファイルをすべて読み込む
        foreach (var file in RootDirectory.GetFiles("*.json", SearchOption.AllDirectories))
        {
            // fileを読み取り、RecordにJSONからデシリアライズする。
            var record = JsonSerializer.Deserialize<Record>(await File.ReadAllTextAsync(file.FullName), JsonEnvironments.Options);
            _records.Add(record!);
        }
    }

    public void StartRecording(
        DeviceId measureDeviceId,
        Direction direction, 
        bool withVoice, 
        bool withBuzz,
        IEnumerable<IDevice> devices)
    {
        if(Recording is not null) throw new InvalidOperationException("Recording is already started.");

        Recording = new Recording(
            RootDirectory,
            measureDeviceId,
            direction,
            withVoice,
            withBuzz,
            devices);
        Recording.StartRecording();
    }

    public void StopRecording()
    {
        if(Recording is null) throw new InvalidOperationException("Recording is not started.");
        _records.Add(Recording.StopRecording());
        Recording = null;
    }

    public async IAsyncEnumerable<Decibel> LoadInputLevelsAsync(Record record, Record.RecordByDevice device)
    {
        var volumeLevels = new List<Decibel>();

        var file = Path.Combine(RootDirectory.FullName, record.DirectoryName, device.FileName);
        await using var reader = new AudioFileReader(file);
        ISampleProvider aWeightingFilter = new AWeightingFilter(reader.ToSampleProvider());
        var buffer = new float[reader.WaveFormat.SampleRate];
        int samplesRead;

        while ((samplesRead = aWeightingFilter.Read(buffer, 0, buffer.Length)) > 0)
        {

            // 音量計算（RMS値）
            double sum = 0;
            for (var i = 0; i < samplesRead; i++)
            {
                sum += buffer[i] * buffer[i];
            }
            var rms = Math.Sqrt(sum / samplesRead);
            var db = 20 * Math.Log10(rms);
            volumeLevels.Add((Decibel)db);
        }

        var settings = await SettingsRepository.LoadAsync();

        var samplingStep = (int)(reader.WaveFormat.SampleRate * settings.Recorder.RecordingSpan.TotalSeconds);

        for (var i = 0; i < volumeLevels.Count; i += samplingStep)
        {
            if (i < volumeLevels.Count)
            {
                yield return volumeLevels[i];
            }
        }
    }
}