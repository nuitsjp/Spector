using System.Globalization;
using System.Windows.Data;
using Spector.Model;

namespace Spector.View.Converter;

public class DecibelConverter : IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is Decibel decibel)
        {
            return decibel.AsPrimitive().ToString("0.00");
        }
        return value;
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is string str)
        {
            return (Decibel)double.Parse(str);
        }
        return value;
    }
}