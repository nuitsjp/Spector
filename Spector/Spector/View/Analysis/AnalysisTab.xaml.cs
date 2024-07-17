using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;

namespace Spector.View.Analysis
{
    /// <summary>
    /// AnalysisTab.xaml の相互作用ロジック
    /// </summary>
    public partial class AnalysisTab : UserControl
    {
        public AnalysisTab()
        {
            InitializeComponent();
        }

        private void RecordGrid_OnLoaded(object sender, RoutedEventArgs e)
        {
            SetupSort((DataGrid)sender);
        }

        private void FrameworkElement_OnSourceUpdated(object sender, DataTransferEventArgs e)
        {
            SetupSort((DataGrid)sender);
        }

        private void SetupSort(DataGrid dataGrid)
        {
            var dataFlow = dataGrid.Columns[0]; // 0番目の列（DataFlow列）を指定
            dataGrid.Items.SortDescriptions.Clear();
            dataGrid.Items.SortDescriptions.Add(new SortDescription(dataFlow.SortMemberPath, ListSortDirection.Descending));

            foreach (var col in dataGrid.Columns)
            {
                col.SortDirection = null;
            }
            dataFlow.SortDirection = ListSortDirection.Descending;
            dataGrid.Items.Refresh();
        }
    }
}
