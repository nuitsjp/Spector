using MaterialDesignThemes.Wpf;
using System.Globalization;
using System.Windows.Data;

namespace Spector.View.Converter;

public class RecordingButtonConverter : IValueConverter

{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var isRecording = (bool?)value ?? false;
        return isRecording ? PackIconKind.Stop : PackIconKind.Record;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}