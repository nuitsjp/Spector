using System.ComponentModel;
using NAudio.CoreAudioApi;

namespace Spector.Model;

public interface IDevice : INotifyPropertyChanged, IDisposable
{
    DeviceId Id { get; }
    DataFlow DataFlow { get; }
    string Name { get; set; }
    string SystemName { get; }
    bool Measure { get; }
    Decibel Level { get; }

    void StartMeasure();
    void StopMeasure();
}