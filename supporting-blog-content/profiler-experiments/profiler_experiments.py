"""
Elasticsearch Vector Search Profile API Experiments

This script runs experiments to showcase the Profile API with vector search,
comparing different indexing strategies and query patterns.
"""

import json
import time
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from elasticsearch import Elasticsearch
from typing import Dict, List, Any
import warnings
import os


warnings.filterwarnings("ignore")


class VectorSearchProfiler:
    def __init__(self, es_client: Elasticsearch):
        """Initialize the Elasticsearch client."""
        self.es = es_client
        self.results = []

    def generate_random_vector(self, dims: int = 2560) -> List[float]:
        """Generate a random vector for search queries."""
        # Generate normalized random vector
        vector = np.random.normal(0, 1, dims)
        vector = vector / np.linalg.norm(vector)
        return vector.tolist()

    def run_vector_search(
        self,
        index_name: str,
        query_vector: List[float],
        size: int = 10,
        filters: Dict = None,
    ) -> Dict[str, Any]:
        """Run a vector search with profiling enabled."""

        # Base knn query
        knn_query = {
            "field": "embedding",
            "query_vector": query_vector,
            "k": size,
            "num_candidates": size * 10,
            "filter": [],
        }

        # Add filters if provided
        if filters:

            if "category" in filters.keys():
                knn_query["filter"].append({"term": {"category": filters["category"]}})
            if "text_length" in filters.keys():
                knn_query["filter"].append(
                    {"range": {"text_length": filters["text_length"]}}
                )

                # Construct the search body
        search_body = {
            "knn": knn_query,
            "size": size,
            "profile": True,
            "_source": ["text", "category", "text_length"],
            #     "query": {"bool": {"filter": []}}
        }

        # Execute search
        start_time = time.time()
        response = self.es.search(index=index_name, body=search_body)
        end_time = time.time()

        # Extract profiling information
        profile_data = self.extract_profile_data(response)
        profile_data["wall_clock_time_ms"] = (end_time - start_time) * 1000
        profile_data["total_hits"] = response["hits"]["total"]["value"]
        profile_data["returned_hits"] = len(response["hits"]["hits"])

        return profile_data

    def extract_profile_data(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Extract key insights from Elasticsearch profiler data using the correct structure"""
        insights = {
            "total_time_ms": 0,
            "vector_search_time_ms": 0,
            "query_time_ms": 0,
            "collect_time_ms": 0,
            "fetch_time_ms": 0,
            "other_time_ms": 0,
            "vector_ops_count": 0,
            "shard_count": 0,
            "docs_examined": 0,
            "detailed_breakdown": {},
            "fetch_breakdown": {},
        }

        try:
            # Total query time from Elasticsearch
            insights["total_time_ms"] = response.get("took", 0)

            # Process all shards
            profile_data = response.get("profile", {})
            shards = profile_data.get("shards", [])
            insights["shard_count"] = len(shards)

            # Aggregate metrics across all shards
            total_vector_time = 0
            total_query_time = 0
            total_collect_time = 0
            total_fetch_time = 0
            total_vector_ops = 0
            total_docs = 0

            for shard in shards:
                # Vector search time - this is in the DFS phase for KNN queries!
                if "dfs" in shard and "knn" in shard["dfs"] and shard["dfs"]["knn"]:
                    knn_profile = shard["dfs"]["knn"][0]
                    vector_time = (
                        knn_profile.get("rewrite_time", 0) / 1_000_000
                    )  # Convert to ms
                    vector_ops = knn_profile.get("vector_operations_count", 0)
                    total_vector_time += vector_time
                    total_vector_ops += vector_ops

                    # Store detailed KNN breakdown
                    if "knn_breakdown" not in insights["detailed_breakdown"]:
                        insights["detailed_breakdown"]["knn_breakdown"] = []
                    insights["detailed_breakdown"]["knn_breakdown"].append(
                        {
                            "rewrite_time_ms": vector_time,
                            "vector_operations_count": vector_ops,
                            "query_type": knn_profile.get("query", "unknown"),
                        }
                    )

                # Query processing time (query execution on candidate set)
                if "searches" in shard and shard["searches"]:
                    search_profile = shard["searches"][0]
                    if "query" in search_profile and search_profile["query"]:
                        query_time = (
                            search_profile["query"][0].get("time_in_nanos", 0)
                            / 1_000_000
                        )
                        total_query_time += query_time

                        # Store query details
                        query_details = search_profile["query"][0]
                        if "query_breakdown" not in insights["detailed_breakdown"]:
                            insights["detailed_breakdown"]["query_breakdown"] = []
                        insights["detailed_breakdown"]["query_breakdown"].append(
                            {
                                "time_ms": query_time,
                                "type": query_details.get("type", "unknown"),
                                "description": query_details.get("description", ""),
                            }
                        )

                    # Collection time (result collection and ranking)
                    if "collector" in search_profile and search_profile["collector"]:
                        collect_time = (
                            search_profile["collector"][0].get("time_in_nanos", 0)
                            / 1_000_000
                        )
                        total_collect_time += collect_time

                # Fetch time (document retrieval)
                if "fetch" in shard:
                    # Handle both old and new fetch structure
                    if isinstance(shard["fetch"], list) and shard["fetch"]:
                        fetch_time = (
                            shard["fetch"][0].get("time_in_nanos", 0) / 1_000_000
                        )
                        total_fetch_time += fetch_time

                        # Get fetch breakdown for document count
                        fetch_breakdown = shard["fetch"][0].get("breakdown", {})
                        total_docs += fetch_breakdown.get("load_stored_fields_count", 0)
                    elif isinstance(shard["fetch"], dict):
                        fetch_time = shard["fetch"].get("time_in_nanos", 0) / 1_000_000
                        total_fetch_time += fetch_time

                        # Get fetch breakdown
                        fetch_breakdown = shard["fetch"].get("breakdown", {})
                        total_docs += fetch_breakdown.get("load_stored_fields_count", 0)

                # Fetch breakdown for detailed analysis
                if "fetch" in shard:
                    fetch_data = shard["fetch"]
                    if isinstance(fetch_data, list) and fetch_data:
                        fetch_data = fetch_data[0]

                    if "breakdown" in fetch_data:
                        breakdown = fetch_data["breakdown"]
                        fetch_breakdown = {
                            "load_stored_fields_ms": breakdown.get(
                                "load_stored_fields", 0
                            )
                            / 1_000_000,
                            "load_source_ms": breakdown.get("load_source", 0)
                            / 1_000_000,
                            "next_reader_ms": breakdown.get("next_reader", 0)
                            / 1_000_000,
                        }
                        if not insights["fetch_breakdown"]:
                            insights["fetch_breakdown"] = fetch_breakdown
                        else:
                            # Aggregate fetch breakdown across shards
                            for key, value in fetch_breakdown.items():
                                insights["fetch_breakdown"][key] = (
                                    insights["fetch_breakdown"].get(key, 0) + value
                                )

            # Set aggregated values
            insights["vector_search_time_ms"] = total_vector_time
            insights["query_time_ms"] = total_query_time
            insights["collect_time_ms"] = total_collect_time
            insights["fetch_time_ms"] = total_fetch_time
            insights["vector_ops_count"] = total_vector_ops
            insights["docs_examined"] = total_docs

            # Calculate other/overhead time
            accounted_time = (
                total_vector_time
                + total_query_time
                + total_collect_time
                + total_fetch_time
            )
            insights["other_time_ms"] = max(
                0, insights["total_time_ms"] - accounted_time
            )

            # Debug output if all times are still zero
            if (
                insights["total_time_ms"] == 0
                and insights["vector_search_time_ms"] == 0
            ):
                print(f"⚠️  Debug - Profile structure keys: {list(profile_data.keys())}")
                if shards:
                    print(f"⚠️  Debug - First shard keys: {list(shards[0].keys())}")
                    if "dfs" in shards[0]:
                        print(f"⚠️  Debug - DFS keys: {list(shards[0]['dfs'].keys())}")

        except Exception as e:
            print(f"⚠️  Error extracting profiler insights: {e}")
            print(
                f"Debug - Profile structure: {json.dumps(response.get('profile', {}), indent=2)[:500]}..."
            )

        return insights

    def _extract_vector_operations(self, query_profile: Dict, profile_info: Dict):
        """Recursively extract vector search timing from query profile."""
        if isinstance(query_profile, dict):
            query_type = query_profile.get("type", "").lower()
            description = query_profile.get("description", "").lower()

            # Look for vector-related operations
            if any(
                keyword in query_type or keyword in description
                for keyword in ["vector", "knn", "hnsw", "flat", "dense"]
            ):
                time_ms = query_profile.get("time_in_nanos", 0) / 1_000_000
                profile_info["vector_search_time_ms"] += time_ms
                profile_info["vector_ops_count"] += 1

            # Recursively search children
            for child in query_profile.get("children", []):
                self._extract_vector_operations(child, profile_info)

    def experiment_1_brute_force_vs_hnsw(self) -> None:
        """Experiment 1: Compare Brute Force vs HNSW performance."""
        print("\n=== Experiment 1: Flat vs. HNSW dense vector ===")

        indices = {
            "Flat (float32)": "wikipedia-brute-force-1shard",
            "HNSW (int8)": "wikipedia-int8-hnsw",
        }

        query_vector = self.generate_random_vector()

        for name, index in indices.items():
            try:
                print(f"\nTesting {name} ({index})...")

                # Run multiple queries and average the results
                runs = []
                for i in range(50):
                    result = self.run_vector_search(index, query_vector, size=10)
                    runs.append(result)
                    time.sleep(0.1)  # Small delay between runs

                # Average the results
                avg_result = self._average_results(runs)
                avg_result["experiment"] = "Flat vs HNSW"
                avg_result["index_type"] = name
                avg_result["index_name"] = index

                self.results.append(avg_result)

                print(f"  Average total time (ES): {avg_result['total_time_ms']:.2f}ms")
                print(
                    f"  Average vector search time: {avg_result['vector_search_time_ms']:.2f}ms"
                )
                print(f"  Average query time: {avg_result['query_time_ms']:.2f}ms")
                print(f"  Average collect time: {avg_result['collect_time_ms']:.2f}ms")
                print(f"  Average fetch time: {avg_result['fetch_time_ms']:.2f}ms")
                print(
                    f"  Average wall clock time: {avg_result['wall_clock_time_ms']:.2f}ms"
                )
                print(f"  Vector operations: {avg_result['vector_ops_count']:.0f}")

            except Exception as e:
                print(f"Error testing {name}: {e}")

    def experiment_2_sharding_impact(self) -> None:
        """Experiment 2: Impact of sharding on brute force search."""
        print("\n=== Experiment 2: Impact of Sharding on Brute Force Search ===")

        indices = {
            "1 Shard": "wikipedia-brute-force-1shard",
            "3 Shards": "wikipedia-brute-force-3shards",  # Note: actually 2 shards per mapping
        }

        query_vector = self.generate_random_vector()

        for name, index in indices.items():
            try:
                print(f"\nTesting {name} ({index})...")

                runs = []
                for i in range(50):
                    result = self.run_vector_search(index, query_vector, size=10)
                    runs.append(result)
                    time.sleep(0.1)

                avg_result = self._average_results(runs)
                avg_result["experiment"] = "Sharding Impact"
                avg_result["index_type"] = name
                avg_result["index_name"] = index

                self.results.append(avg_result)

                print(f"  Shards: {avg_result['shard_count']}")
                print(f"  Average total time (ES): {avg_result['total_time_ms']:.2f}ms")
                print(
                    f"  Average vector search time: {avg_result['vector_search_time_ms']:.2f}ms"
                )
                print(f"  Average query time: {avg_result['query_time_ms']:.2f}ms")
                print(f"  Average collect time: {avg_result['collect_time_ms']:.2f}ms")
                print(f"  Average fetch time: {avg_result['fetch_time_ms']:.2f}ms")
                print(
                    f"  Average wall clock time: {avg_result['wall_clock_time_ms']:.2f}ms"
                )
                print(f"  Vector operations: {avg_result['vector_ops_count']:.0f}")

            except Exception as e:
                print(f"Error testing {name}: {e}")

    def experiment_3_combined_filter_vector(self) -> None:
        """Experiment 4: Combined filter and vector search."""
        print("\n=== Experiment 3: Combined Filter and Vector Search ===")

        index_name = "wikipedia-brute-force-1shard"
        query_vector = self.generate_random_vector()

        experiments = [
            ("No Filter", {}),
            ("Category Filter", {"category": "short"}),
            ("Text Length Filter", {"text_length": {"gte": 1000, "lte": 2000}}),
            ("Combined Filters", {"category": "short", "text_length": {"lte": 10}}),
        ]

        for exp_name, filters in experiments:
            try:
                print(f"\nTesting {exp_name}...")

                runs = []
                for i in range(5):
                    result = self.run_vector_search(
                        index_name, query_vector, size=10, filters=filters
                    )
                    runs.append(result)
                    time.sleep(0.1)

                avg_result = self._average_results(runs)
                avg_result["experiment"] = "Filter + Vector"
                avg_result["index_type"] = exp_name
                avg_result["index_name"] = index_name

                self.results.append(avg_result)

                print(f"  Total hits: {avg_result['total_hits']}")
                print(f"  Average total time (ES): {avg_result['total_time_ms']:.2f}ms")
                print(
                    f"  Average vector search time: {avg_result['vector_search_time_ms']:.2f}ms"
                )
                print(f"  Average query time: {avg_result['query_time_ms']:.2f}ms")
                print(f"  Average collect time: {avg_result['collect_time_ms']:.2f}ms")
                print(f"  Average fetch time: {avg_result['fetch_time_ms']:.2f}ms")
                print(
                    f"  Average wall clock time: {avg_result['wall_clock_time_ms']:.2f}ms"
                )
                print(f"  Vector operations: {avg_result['vector_ops_count']:.0f}")

            except Exception as e:
                print(f"Error testing {exp_name}: {e}")

    def experiment_4_cache_performance(self) -> None:
        """Experiment 4: Compare cold vs warm query performance (caching effects)."""
        print("\n=== Experiment 4: Cache Performance (Cold vs Warm Queries) ===")

        # Use HNSW index for this test as it benefits most from caching
        index_name = "wikipedia-float32-hnsw"
        query_vector = self.generate_random_vector()

        # Test scenarios
        scenarios = [
            ("Cold Query (First Run)", True),  # Clear caches before
            ("Warm Query (Cached)", False),  # Use existing caches
        ]

        for scenario_name, clear_cache in scenarios:
            try:
                print(f"\nTesting {scenario_name}...")

                # Clear caches if this is a cold query test
                if clear_cache:
                    try:
                        print("  Clearing caches...")
                        # Clear query cache
                        self.es.indices.clear_cache(index=index_name, query=True)
                        # Clear request cache
                        self.es.indices.clear_cache(index=index_name, request=True)
                        # Clear fielddata cache
                        self.es.indices.clear_cache(index=index_name, fielddata=True)
                        time.sleep(1)  # Allow cache clearing to complete
                    except Exception as cache_error:
                        print(f"    Warning: Could not clear all caches: {cache_error}")

                # Run the query multiple times for this scenario
                runs = []

                if clear_cache:
                    # For cold query, just run once (first run after cache clear)
                    result = self.run_vector_search(index_name, query_vector, size=10)
                    runs.append(result)
                else:
                    # For warm query, run multiple times to show consistent cached performance
                    for i in range(50):
                        result = self.run_vector_search(
                            index_name, query_vector, size=10
                        )
                        runs.append(result)
                        time.sleep(0.1)  # Small delay between runs

                # Average the results
                if runs:
                    avg_result = self._average_results(runs)
                    avg_result["experiment"] = "Cache Performance"
                    avg_result["index_type"] = scenario_name
                    avg_result["index_name"] = index_name
                    avg_result["runs_count"] = len(runs)

                    self.results.append(avg_result)

                    print(f"  Runs executed: {len(runs)}")
                    print(
                        f"  Average total time (ES): {avg_result['total_time_ms']:.2f}ms"
                    )
                    print(
                        f"  Average vector search time: {avg_result['vector_search_time_ms']:.2f}ms"
                    )
                    print(f"  Average query time: {avg_result['query_time_ms']:.2f}ms")
                    print(
                        f"  Average collect time: {avg_result['collect_time_ms']:.2f}ms"
                    )
                    print(f"  Average fetch time: {avg_result['fetch_time_ms']:.2f}ms")
                    print(
                        f"  Average wall clock time: {avg_result['wall_clock_time_ms']:.2f}ms"
                    )

                    if clear_cache:
                        print("  ↳ This represents cold start performance")
                    else:
                        print("  ↳ This represents cached/warm performance")

            except Exception as e:
                print(f"Error testing {scenario_name}: {e}")

    def _average_results(self, results: List[Dict]) -> Dict:
        """Average multiple result dictionaries."""
        if not results:
            return {}

        avg_result = {}
        numeric_keys = [
            "total_time_ms",
            "vector_search_time_ms",
            "query_time_ms",
            "collect_time_ms",
            "fetch_time_ms",
            "other_time_ms",
            "wall_clock_time_ms",
            "total_hits",
            "returned_hits",
            "vector_ops_count",
            "docs_examined",
        ]

        for key in numeric_keys:
            values = [r.get(key, 0) for r in results if key in r]
            avg_result[key] = np.mean(values) if values else 0

        # Take the first non-numeric values
        for key in ["shard_count"]:
            for r in results:
                if key in r:
                    avg_result[key] = r[key]
                    break

        return avg_result

    def create_results_table(self) -> pd.DataFrame:
        """Create a formatted results table."""
        if not self.results:
            print("No results to display")
            return pd.DataFrame()

        df = pd.DataFrame(self.results)

        # Select and format columns
        display_columns = [
            "experiment",
            "index_type",
            "total_time_ms",
            "vector_search_time_ms",
            "query_time_ms",
            "collect_time_ms",
            "fetch_time_ms",
            "other_time_ms",
            "wall_clock_time_ms",
            "total_hits",
            "shard_count",
        ]

        # Only include columns that exist
        available_columns = [col for col in display_columns if col in df.columns]
        display_df = df[available_columns].copy()

        # Round numeric columns
        numeric_cols = [
            "total_time_ms",
            "vector_search_time_ms",
            "query_time_ms",
            "collect_time_ms",
            "fetch_time_ms",
            "other_time_ms",
            "wall_clock_time_ms",
        ]
        for col in numeric_cols:
            if col in display_df.columns:
                display_df[col] = display_df[col].round(2)

        if "total_hits" in display_df.columns:
            display_df["total_hits"] = display_df["total_hits"].astype(int)
        if "shard_count" in display_df.columns:
            display_df["shard_count"] = display_df["shard_count"].astype(int)

        return display_df

    def create_performance_chart(self) -> None:
        """Create a horizontal stacked bar chart comparing performance times."""
        if not self.results:
            print("No results to plot")
            return

        # Prepare data for plotting
        df = pd.DataFrame(self.results)

        # Create figure with subplots for each experiment
        experiments = df["experiment"].unique()
        fig, axes = plt.subplots(
            len(experiments), 1, figsize=(15, len(experiments) * 8)
        )  # More height per experiment

        if len(experiments) == 1:
            axes = [axes]

        colors = ["#FF6B6B", "#A29BFE", "#45B7D1", "#96CEB4", "#FFEAA7"]

        for i, experiment in enumerate(experiments):
            exp_data = df[df["experiment"] == experiment].copy()

            # Create labels and data for stacked bars
            labels = exp_data["index_type"].tolist()
            vector_times = exp_data["vector_search_time_ms"].fillna(0).tolist()
            query_times = exp_data["query_time_ms"].fillna(0).tolist()
            collect_times = exp_data["collect_time_ms"].fillna(0).tolist()
            fetch_times = exp_data["fetch_time_ms"].fillna(0).tolist()
            other_times = exp_data["other_time_ms"].fillna(0).tolist()

            # Create base for stacking
            y = np.arange(len(labels))  # Changed from x to y
            height = 0.35  # Reduced from 0.6 to make bars thinner and more spaced

            # Create horizontal stacked bars
            left = np.zeros(len(labels))  # Changed from bottom to left

            if any(v > 0 for v in vector_times):
                p1 = axes[i].barh(
                    y,
                    vector_times,
                    height,
                    left=left,  # Changed to barh
                    label="Vector Search",
                    color=colors[0],
                )
                left = np.array(vector_times)  # Changed from bottom to left

            if any(v > 0 for v in query_times):
                p2 = axes[i].barh(
                    y,
                    query_times,
                    height,
                    left=left,  # Changed to barh
                    label="Query Processing",
                    color=colors[1],
                )
                left += np.array(query_times)

            if any(v > 0 for v in collect_times):
                p3 = axes[i].barh(
                    y,
                    collect_times,
                    height,
                    left=left,  # Changed to barh
                    label="Collection",
                    color=colors[2],
                )
                left += np.array(collect_times)

            if any(v > 0 for v in fetch_times):
                p4 = axes[i].barh(
                    y,
                    fetch_times,
                    height,
                    left=left,  # Changed to barh
                    label="Fetch",
                    color=colors[3],
                )
                left += np.array(fetch_times)

            if any(v > 0 for v in other_times):
                p5 = axes[i].barh(
                    y,
                    other_times,
                    height,
                    left=left,  # Changed to barh
                    label="Other/Overhead",
                    color=colors[4],
                )
                left += np.array(other_times)

            axes[i].set_title(f"{experiment}\nQuery Performance Breakdown")
            axes[i].set_xlabel("Time (ms)")  # Changed from ylabel to xlabel
            axes[i].set_yticks(y)  # Changed from xticks to yticks
            axes[i].set_yticklabels(
                labels
            )  # Changed from xticklabels, removed rotation
            axes[i].legend()

            # Add total time labels on bars
            total_times = exp_data["total_time_ms"].fillna(0).tolist()
            for j, total in enumerate(total_times):
                if total > 0:
                    axes[i].text(
                        total + total * 0.02,
                        j,
                        f"{total:.1f}ms",  # Swapped x,y coordinates
                        ha="left",
                        va="center",
                        fontsize=9,
                        fontweight="bold",
                    )  # Changed alignment

        plt.tight_layout()
        plt.savefig("vector_search_performance.png", dpi=300, bbox_inches="tight")
        plt.show()

    def run_all_experiments(self) -> None:
        """Run all experiments and generate results."""
        print("Starting Elasticsearch Vector Search Profile Experiments...")
        print("=" * 60)

        # Clear previous results
        self.results = []

        # Run experiments
        self.experiment_1_brute_force_vs_hnsw()
        self.experiment_2_sharding_impact()
        if es.info()["name"] == "serverless":
            print(
                "Skipping experiment 3 because we can't control the number of shards in a serverless deployment"
            )
        else:
            self.experiment_3_combined_filter_vector()
        self.experiment_4_cache_performance()

        # Generate results
        print("\n" + "=" * 60)
        print("RESULTS SUMMARY")
        print("=" * 60)

        # Display table
        results_df = self.create_results_table()
        print("\nPerformance Results Table:")
        print(results_df.to_string(index=False))

        # Create charts
        print("\nGenerating performance charts...")
        self.create_performance_chart()

        # Print insights
        self._print_insights()

    def _print_insights(self) -> None:
        """Print key insights from the experiments."""
        print("\n" + "=" * 60)
        print("KEY INSIGHTS")
        print("=" * 60)

        if len(self.results) >= 2:
            # Brute Force vs HNSW insights
            brute_force_results = [
                r for r in self.results if "Flat (float32)" in r.get("index_type", "")
            ]
            hnsw_results = [
                r for r in self.results if "HNSW" in r.get("index_type", "")
            ]

            if brute_force_results and hnsw_results:
                bf_time = brute_force_results[0]["total_time_ms"]
                hnsw_time = hnsw_results[0]["total_time_ms"]
                bf_vector_time = brute_force_results[0]["vector_search_time_ms"]
                hnsw_vector_time = hnsw_results[0]["vector_search_time_ms"]

                speedup = bf_time / hnsw_time if hnsw_time > 0 else 0
                vector_speedup = (
                    bf_vector_time / hnsw_vector_time if hnsw_vector_time > 0 else 0
                )

                print(f"\n1. HNSW vs Brute Force:")
                print(f"   - Overall: HNSW is {speedup:.1f}x faster than brute force")
                print(
                    f"   - Vector search: HNSW is {vector_speedup:.1f}x faster for vector operations"
                )
                print(
                    f"   - Brute Force total: {bf_time:.2f}ms vs HNSW total: {hnsw_time:.2f}ms"
                )
                print(
                    f"   - Brute Force vector: {bf_vector_time:.2f}ms vs HNSW vector: {hnsw_vector_time:.2f}ms"
                )

            # Sharding insights
            single_shard = [r for r in self.results if r.get("index_type") == "1 Shard"]
            multi_shard = [r for r in self.results if r.get("index_type") == "3 Shards"]

            if single_shard and multi_shard:
                single_time = single_shard[0]["total_time_ms"]
                multi_time = multi_shard[0]["total_time_ms"]
                single_vector = single_shard[0]["vector_search_time_ms"]
                multi_vector = multi_shard[0]["vector_search_time_ms"]

                improvement = (
                    (single_time - multi_time) / single_time * 100
                    if single_time > 0
                    else 0
                )
                vector_improvement = (
                    (single_vector - multi_vector) / single_vector * 100
                    if single_vector > 0
                    else 0
                )

                print(f"\n2. Sharding Impact:")
                print(
                    f"   - Overall: Multi-shard is {improvement:.1f}% faster than single shard"
                )
                print(
                    f"   - Vector search: Multi-shard is {vector_improvement:.1f}% faster for vector operations"
                )
                print(
                    f"   - Single shard: {single_time:.2f}ms vs Multi-shard: {multi_time:.2f}ms"
                )
                print(
                    f"   - Single vector: {single_vector:.2f}ms vs Multi vector: {multi_vector:.2f}ms"
                )

            # Filter insights
            no_filter = [r for r in self.results if r.get("index_type") == "No Filter"]
            with_filter = [
                r
                for r in self.results
                if "Filter" in r.get("index_type", "")
                and r.get("index_type") != "No Filter"
            ]

            if no_filter and with_filter:
                base_hits = no_filter[0]["total_hits"]
                filtered_hits = min(r["total_hits"] for r in with_filter)
                reduction = (
                    (base_hits - filtered_hits) / base_hits * 100
                    if base_hits > 0
                    else 0
                )

                base_time = no_filter[0]["total_time_ms"]
                filtered_time = min(r["total_time_ms"] for r in with_filter)
                time_improvement = (
                    (base_time - filtered_time) / base_time * 100
                    if base_time > 0
                    else 0
                )

                print(f"\n3. Filtering Benefits:")
                print(f"   - Filters reduced search space by {reduction:.1f}%")
                print(
                    f"   - Query time improved by {time_improvement:.1f}% with filtering"
                )
                print(
                    f"   - Full index: {base_hits:,} docs vs Filtered: {filtered_hits:,} docs"
                )
                print(
                    f"   - No filter: {base_time:.2f}ms vs With filter: {filtered_time:.2f}ms"
                )


if __name__ == "__main__":
    # Configuration
    # Get environment variables
    host = os.getenv("ES_HOST")
    api_key = os.getenv("API_KEY")

    if not host or not api_key:
        raise ValueError("Please set ES_HOST and API_KEY environment variables")

    # Create Elasticsearch client
    es = Elasticsearch(hosts=host, api_key=api_key, request_timeout=60)

    # Initialize and run experiments
    profiler = VectorSearchProfiler(es)

    try:
        profiler.run_all_experiments()
        print(
            f"\nExperiments completed! Charts saved as 'vector_search_performance.png'"
        )

    except Exception as e:
        print(f"Error running experiments: {e}")
        print("Please ensure:")
        print("1. Elasticsearch is running and accessible")
        print("2. The indices are properly created and populated")
        print("3. The elasticsearch-py library is installed: pip install elasticsearch")
