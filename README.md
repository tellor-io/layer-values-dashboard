# Layer Values Dashboard

   **A bespoke web dashboard for monitoring, viewing, and analyzing data gathered by the tellor layer-values-monitor.**

## Prerequisites:
- git
- uv
- Python 3.12+
- A working layer-values-monitor.

### Installation

1. **Download the project files**

```sh
git clone https://github.com/tellor-io/layer-values-dashboard && cd layer-values-dashboard
```

2. **Create and mount a python environment.**

```sh
uv venv && source .venv/bin/activate
```

3. **Start the dashboard**

```sh
uv run python start_dashboard.py --source-dir /home/<username>/path/to/layer-values-monitor/logs/ --port 8000
```

4. **Open your browser** and go to: `http://localhost:8000` (or your custom port)

## Usage

### Keyboard Shortcuts

- `Ctrl/Cmd + K`: Focus search box
- `Ctrl/Cmd + R`: Refresh data
- `Escape`: Close modal dialogs

### API Endpoints

The backend provides RESTful API endpoints:

- `GET /api/info` - Data source information
- `GET /api/stats` - Statistical overview
- `GET /api/data` - Paginated data with filtering
- `GET /api/search` - Full-text search

Visit `http://localhost:8000/docs` for interactive API documentation.

## Data Format

The dashboard expects CSV files with the following columns:

| Column | Type | Description |
|--------|------|-------------|
| REPORTER | string | Reporter address |
| QUERY_TYPE | string | Type of query (e.g., "SpotPrice") |
| QUERY_ID | string | Unique query identifier |
| AGGREGATE_METHOD | string | Aggregation method used |
| CYCLELIST | boolean | Whether it's in cyclelist |
| POWER | integer | Reporter power |
| TIMESTAMP | integer | Unix timestamp |
| TRUSTED_VALUE | float | Trusted value |
| TX_HASH | string | Transaction hash |
| CURRENT_TIME | integer | Current time |
| TIME_DIFF | integer | Time difference in milliseconds |
| VALUE | float | Reported value |
| DISPUTABLE | boolean | Whether the value is disputable |

## Live Updates

The dashboard automatically:
- Checks for new/updated CSV files every 30 seconds
- Reloads data when changes are detected
- Updates statistics and metrics in real-time
- Preserves user's current view and filters during updates

## Configuration

### Command Line Arguments

```bash
python start_dashboard.py [options]

Options:
  --source-dir, -s    Directory containing CSV files (default: source_tables)
  --port, -p          Port to run server on (default: 8000)
  --host              Host to bind server to (default: 0.0.0.0)
  --help, -h          Show help message
```

## Customization

### Styling
- Edit `frontend/style.css` to customize the appearance
- The design uses CSS Grid and Flexbox for responsive layout
- Color scheme can be modified by changing CSS custom properties

### Functionality
- Add new API endpoints in `backend/main.py`
- Extend the frontend in `frontend/app.js`
- Modify data processing logic in the DuckDB queries

## Troubleshooting

### Common Issues

1. **"No CSV files found"**
   - Ensure CSV files are located at the path specified with the `--source-dir` flag.

2. **"Failed to load data"**
   - Verify CSV file format matches expected schema
   - Check console logs for detailed error messages

### Debug Mode

Run with debug logging:
```bash
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload --log-level debug
```

## Security Notes

- This dashboard is designed for local/internal use!
- No authentication is implemented by default!
- Be cautious when exposing to external networks!
- Consider adding authentication for production deployments!

## Contributing

Feel free to submit issues, feature requests, or pull requests to improve the dashboard!