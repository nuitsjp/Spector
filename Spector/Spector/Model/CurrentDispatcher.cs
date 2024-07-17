using System.Windows.Threading;

namespace Spector.Model;

/// <summary>
/// MMDeviceが取得したスレッドと同じスレッドで利用しないとCOMエラーが発生するため、同一スレッドで処理を行うためのクラス
/// </summary>
public static class CurrentDispatcher
{
    /// <summary>
    /// ディスパッチャー
    /// </summary>
    public static Dispatcher Dispatcher { get; set; } = Dispatcher.CurrentDispatcher;

    /// <summary>
    /// ディスパッチャーを使用して処理を行う
    /// </summary>
    /// <typeparam name="TResult"></typeparam>
    /// <param name="callback"></param>
    /// <returns></returns>
    public static DispatcherOperation<TResult> InvokeAsync<TResult>(Func<TResult> callback)
    {
        return Dispatcher.InvokeAsync(callback);
    }

    /// <summary>
    /// ディスパッチャーを使用して処理を行う
    /// </summary>
    /// <param name="action"></param>
    /// <returns></returns>
    public static void Invoke(Action action)
    {
        if (Dispatcher.HasShutdownStarted is false)
        {
            Dispatcher.Invoke(action);
        }
    }

}