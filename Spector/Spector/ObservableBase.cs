using CommunityToolkit.Mvvm.ComponentModel;
using Reactive.Bindings.Disposables;

namespace Spector;

public abstract class ObservableBase : ObservableObject, IDisposable
{
    protected CompositeDisposable CompositeDisposable { get; } = new();

    public virtual void Dispose()
    {
        CompositeDisposable.Dispose();
        GC.SuppressFinalize(this);
    }
}