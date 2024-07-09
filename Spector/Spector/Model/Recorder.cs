using static Microsoft.WindowsAPICodePack.Shell.PropertySystem.SystemProperties.System;
using System.IO;

namespace Spector.Model;

public class Recorder
{
    private Recording? Recording { get; set; }

    public void StartRecording(
        DirectoryInfo directory, 
        Direction direction, 
        bool withVoice, 
        bool withBuzz,
        IEnumerable<IDevice> devices)
    {
        if(Recording is not null) throw new InvalidOperationException("Recording is already started.");

        Recording = new Recording(
            directory,
            direction,
            withVoice,
            withBuzz,
            devices);
        Recording.StartRecording();
    }

    public void StopRecording()
    {
        if(Recording is null) throw new InvalidOperationException("Recording is not started.");
        Recording.StopRecording();
    }
}