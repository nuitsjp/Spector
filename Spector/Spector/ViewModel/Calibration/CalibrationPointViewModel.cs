namespace Spector.ViewModel.Calibration;

public class CalibrationPointViewModel : ObservableBase
{
    public double Decibel { get; set; } = 0;
    public double VolumeLevel { get; set; } = 0;
    public string Note { get; }

    public CalibrationPointViewModel(double decibel, double volumeLevel, string note)
    {
        Decibel = decibel;
        VolumeLevel = volumeLevel;
        Note = note;
    }
}