'use client';

import { useState, useEffect } from 'react';

interface RelationshipScore {
    contact_id: string;
    contact_name: string;
    overall_score: number;
    frequency_score: number;
    recency_score: number;
    depth_score: number;
    sentiment_score: number;
    trend: string;
}

export default function RelationshipSection() {
    const [scores, setScores] = useState<RelationshipScore[]>([]);
    const [loading, setLoading] = useState(true);
    const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
        fetchScores();
  }, []);

  async function fetchScores() {
        try {
                const res = await fetch('/api/relationship-scores');
                const json = await res.json();
                if (json.success) {
                          setScores(json.data || []);
                }
        } catch (e) {
                console.error('Failed to fetch relationship scores:', e);
        }
        setLoading(false);
  }

  async function recalculate() {
        setRecalculating(true);
        try {
                await fetch('/api/relationship-scores', { method: 'POST' });
                await fetchScores();
        } catch (e) {
                console.error('Failed to recalculate:', e);
        }
        setRecalculating(false);
  }

  function getScoreColor(score: number) {
        if (score >= 80) return 'text-green-600 bg-green-50 dark:bg-green-900/20';
        if (score >= 60) return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20';
        if (score >= 40) return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
        return 'text-red-600 bg-red-50 dark:bg-red-900/20';
  }

  function getScoreLabel(score: number) {
        if (score >= 80) return 'Strong';
        if (score >= 60) return 'Good';
        if (score >= 40) return 'Moderate';
        return 'Needs attention';
  }

  function getTrendIcon(trend: string) {
        if (trend === 'improving') return '\u2191';
        if (trend === 'declining') return '\u2193';
        return '\u2192';
  }

  if (loading) {
        return (
                <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                </div>
              );
  }
  
    return (
          <div className="space-y-4">
                <div className="flex items-center justify-between">
                        <div>
                                  <h2 className="text-lg font-semibold">Relationship Intelligence</h2>
                                  <p className="text-sm text-gray-500 dark:text-gray-400">
                                              AI-powered relationship health scores based on your conversations
                                  </p>
                        </div>
                        <button
                                    onClick={recalculate}
                                    disabled={recalculating}
                                    className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                                  >
                          {recalculating ? 'Calculating...' : 'Recalculate'}
                        </button>
                </div>
          
            {scores.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                              <p className="text-3xl mb-2">{'\uD83E\uDD1D'}</p>
                              <p className="text-sm">No relationship scores yet.</p>
                              <p className="text-xs mt-1">Click Recalculate to generate scores from your chat data.</p>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {scores.slice(0, 20).map((score) => (
                                  <div
                                                  key={score.contact_id}
                                                  className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                                                >
                                                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 font-semibold text-sm">
                                                  {score.contact_name?.charAt(0)?.toUpperCase() || '?'}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                                <p className="font-medium text-sm truncate">{score.contact_name || 'Unknown'}</p>
                                                                <div className="flex gap-2 mt-1">
                                                                                  <span className="text-xs text-gray-500">Freq: {score.frequency_score || 0}</span>
                                                                                  <span className="text-xs text-gray-500">Depth: {score.depth_score || 0}</span>
                                                                                  <span className="text-xs text-gray-500">Sent: {score.sentiment_score || 0}</span>
                                                                </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                                <span className="text-sm">{getTrendIcon(score.trend)}</span>
                                                                <div className={`px-2 py-1 rounded-full text-xs font-medium ${getScoreColor(score.overall_score)}`}>
                                                                  {score.overall_score} - {getScoreLabel(score.overall_score)}
                                                                </div>
                                                </div>
                                  </div>
                                ))}
                    </div>
                )}
          
            {scores.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                                          <p className="text-2xl font-bold text-green-600">{scores.filter(s => s.overall_score >= 80).length}</p>
                                          <p className="text-xs text-green-700 dark:text-green-400">Strong</p>
                              </div>
                              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                                          <p className="text-2xl font-bold text-blue-600">{scores.filter(s => s.overall_score >= 60 && s.overall_score < 80).length}</p>
                                          <p className="text-xs text-blue-700 dark:text-blue-400">Good</p>
                              </div>
                              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 text-center">
                                          <p className="text-2xl font-bold text-yellow-600">{scores.filter(s => s.overall_score >= 40 && s.overall_score < 60).length}</p>
                                          <p className="text-xs text-yellow-700 dark:text-yellow-400">Moderate</p>
                              </div>
                              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
                                          <p className="text-2xl font-bold text-red-600">{scores.filter(s => s.overall_score < 40).length}</p>
                                          <p className="text-xs text-red-700 dark:text-red-400">Needs attention</p>
                              </div>
                    </div>
                )}
          </div>
        );
}</div>
