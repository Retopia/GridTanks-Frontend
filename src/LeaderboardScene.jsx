import { useState, useEffect } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const LeaderboardScene = ({ switchToMenu }) => {
    const [leaderboardData, setLeaderboardData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [limit] = useState(10); // Show 10 entries per page
    const [hasMorePages, setHasMorePages] = useState(false);

    // Fetch leaderboard data
    const fetchLeaderboard = async (page = 1) => {
        try {
            setLoading(true);
            setError(null);

            const response = await fetch(`${API_BASE_URL}/leaderboard?page=${page}&limit=${limit}`);

            if (!response.ok) {
                throw new Error(`Failed to fetch leaderboard: ${response.status}`);
            }

            const data = await response.json();
            setLeaderboardData(data.entries);

            // Check if there are more pages by seeing if we got a full page
            setHasMorePages(data.entries.length === limit);

        } catch (err) {
            console.error('Error fetching leaderboard:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Fetch data on component mount and when page changes
    useEffect(() => {
        fetchLeaderboard(currentPage);
    }, [currentPage]);

    // Handle pagination
    const goToNextPage = () => {
        if (hasMorePages) {
            setCurrentPage(prev => prev + 1);
        }
    };

    const goToPrevPage = () => {
        if (currentPage > 1) {
            setCurrentPage(prev => prev - 1);
        }
    };

    // Retry function for error state
    const handleRetry = () => {
        fetchLeaderboard(currentPage);
    };

    return (
        <div className="scene-basic">
            <div className="leaderboard-content">
                <h2 className="scene-title">Leaderboard</h2>

                {/* Skeleton Loading State */}
                {loading && (
                    <>
                        <div className="leaderboard-table">
                            <div className="leaderboard-header">
                                <div>Rank</div>
                                <div>Username</div>
                                <div>Stage Reached</div>
                                <div>Time</div>
                                <div>Date Submitted</div>
                            </div>
                            
                            {/* Generate 10 skeleton rows */}
                            {Array.from({ length: 10 }, (_, index) => (
                                <div key={`skeleton-${index}`} className="leaderboard-row skeleton-row">
                                    <div className="skeleton-item skeleton-rank"></div>
                                    <div className="skeleton-item skeleton-username"></div>
                                    <div className="skeleton-item skeleton-stage"></div>
                                    <div className="skeleton-item skeleton-time"></div>
                                    <div className="skeleton-item skeleton-date"></div>
                                </div>
                            ))}
                        </div>

                        {/* Skeleton Pagination Controls */}
                        <div className="pagination-controls">
                            <div className="pagination-button skeleton-pagination-btn">
                                <div className="skeleton-item skeleton-btn-text"></div>
                            </div>
                            
                            <div className="page-info">
                                <div className="skeleton-item skeleton-page-info"></div>
                            </div>
                            
                            <div className="pagination-button skeleton-pagination-btn">
                                <div className="skeleton-item skeleton-btn-text"></div>
                            </div>
                        </div>
                    </>
                )}

                {/* Error State */}
                {error && !loading && (
                    <div className="error-state">
                        <p>Error loading leaderboard: {error}</p>
                        <button className="retry-button" onClick={handleRetry}>
                            Retry
                        </button>
                    </div>
                )}

                {/* Leaderboard Table */}
                {!loading && !error && (
                    <>
                        <div className="leaderboard-table">
                            <div className="leaderboard-header">
                                <div>Rank</div>
                                <div>Username</div>
                                <div>Stage Reached</div>
                                <div>Time</div>
                                <div>Date Submitted</div>
                            </div>

                            {leaderboardData.length > 0 ? (
                                leaderboardData.map((entry, index) => (
                                    <div key={`${entry.username}-${index}`} className="leaderboard-row">
                                        <div>{((currentPage - 1) * limit) + index + 1}</div>
                                        <div>{entry.username}</div>
                                        <div>{entry.stage_reached}</div>
                                        <div>{entry.time}</div>
                                        <div>{entry.date_submitted}</div>
                                    </div>
                                ))
                            ) : (
                                <div className="no-data">
                                    <p>No leaderboard entries found.</p>
                                </div>
                            )}
                        </div>

                        {/* Pagination Controls */}
                        {(currentPage > 1 || hasMorePages) && (
                            <div className="pagination-controls">
                                <button 
                                    className="pagination-button" 
                                    onClick={goToPrevPage}
                                    disabled={currentPage === 1}
                                >
                                    Previous
                                </button>
                                
                                <span className="page-info">
                                    Page {currentPage}
                                </span>
                                
                                <button 
                                    className="pagination-button" 
                                    onClick={goToNextPage}
                                    disabled={!hasMorePages}
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </>
                )}

                <button className="back-button" onClick={switchToMenu}>
                    Back to Menu
                </button>
            </div>
        </div>
    );
};

export default LeaderboardScene;