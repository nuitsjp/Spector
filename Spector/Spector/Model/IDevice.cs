using NAudio.CoreAudioApi;

namespace Spector.Model;

public interface IDevice : IDisposable
{
    DeviceId Id { get; }
    DataFlow DataFlow { get; }
    string Name { get; }
    Decibel Level { get; }
}