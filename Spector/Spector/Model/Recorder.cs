using System.IO;
using Reactive.Bindings;

namespace Spector.Model;

public class Recorder
{
    private Recording? Recording { get; set; }
    private readonly ReactiveCollection<Record> _records = new();
    public ReadOnlyReactiveCollection<Record> Records { get; }


    public Recorder()
    {
        Records = _records.ToReadOnlyReactiveCollection();
    }

    public void StartRecording(
        DirectoryInfo directory,
        DeviceId measureDeviceId,
        Direction direction, 
        bool withVoice, 
        bool withBuzz,
        IEnumerable<IDevice> devices)
    {
        if(Recording is not null) throw new InvalidOperationException("Recording is already started.");

        Recording = new Recording(
            directory,
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
    }
}