import os
import time
from elasticsearch import Elasticsearch
from datasets import load_dataset

# Index mappings for different configurations
mappings = {
    # Flat/Brute Force - single shard for comparison
    "wikipedia-brute-force-1shard": {
        "settings": {"number_of_shards": 1, "number_of_replicas": 0},
        "mappings": {
            "properties": {
                "embedding": {
                    "type": "dense_vector",
                    "dims": 2560,
                    "index": True,
                    "similarity": "cosine",
                    "index_options": {"type": "flat"},
                },
                "text": {"type": "text"},
                "category": {"type": "keyword"},  # For filtering experiments
                "text_length": {"type": "integer"},  # For filtering experiments
            }
        },
    },
    # Flat/Brute Force - 3 shards for shard comparison
    "wikipedia-brute-force-3shards": {
        "settings": {"number_of_shards": 2, "number_of_replicas": 0},
        "mappings": {
            "properties": {
                "embedding": {
                    "type": "dense_vector",
                    "dims": 2560,
                    "index": True,
                    "similarity": "cosine",
                    "index_options": {"type": "flat"},
                },
                "text": {"type": "text"},
                "category": {"type": "keyword"},
                "text_length": {"type": "integer"},
            }
        },
    },
    # Float32 HNSW (no compression)
    "wikipedia-float32-hnsw": {
        "settings": {"number_of_shards": 1, "number_of_replicas": 0},
        "mappings": {
            "properties": {
                "embedding": {
                    "type": "dense_vector",
                    "dims": 2560,
                    "index": True,
                    "similarity": "cosine",
                    "index_options": {"type": "hnsw", "m": 16, "ef_construction": 200},
                },
                "text": {"type": "text"},
                "category": {"type": "keyword"},
                "text_length": {"type": "integer"},
            }
        },
    },
    # Int8 HNSW (with quantization)
    "wikipedia-int8-hnsw": {
        "settings": {"number_of_shards": 1, "number_of_replicas": 0},
        "mappings": {
            "properties": {
                "embedding": {
                    "type": "dense_vector",
                    "dims": 2560,
                    "index": True,
                    "similarity": "cosine",
                    "index_options": {
                        "type": "int8_hnsw",
                        "m": 16,
                        "ef_construction": 200,
                    },
                },
                "text": {"type": "text"},
                "category": {"type": "keyword"},
                "text_length": {"type": "integer"},
            }
        },
    },
    # BBQ HNSW (binary quantization)
    "wikipedia-bbq-hnsw": {
        "settings": {"number_of_shards": 1, "number_of_replicas": 0},
        "mappings": {
            "properties": {
                "embedding": {
                    "type": "dense_vector",
                    "dims": 2560,
                    "index": True,
                    "similarity": "cosine",
                    "index_options": {
                        "type": "bbq_hnsw",
                        "m": 16,
                        "ef_construction": 100,
                        "rescore_vector": {"oversample": 3},
                    },
                },
                "text": {"type": "text"},
                "category": {"type": "keyword"},
                "text_length": {"type": "integer"},
            }
        },
    },
}


def categorize_text(text):
    """Categorize text for filtering experiments"""
    length = len(text)
    if length < 100:
        return "short"
    elif length < 500:
        return "medium"
    else:
        return "long"


def upload_to_elasticsearch(es, indices=None, batch_size=100, max_docs=100000):
    """
    Upload documents from Hugging Face dataset to Elasticsearch in batches

    Args:
        es: Elasticsearch client object
        indices: List of index names to upload to
        batch_size: Number of documents to process in each batch
        max_docs: Maximum number of documents to process
    """
    if indices is None:
        indices = list(mappings.keys())

    # Load the dataset (uses parquet files automatically)
    dataset = load_dataset("maknee/wikipedia_qwen_4b", streaming=True)
    base_data = dataset["train"]

    batch_operations = []
    doc_count = 0

    print(f"Starting upload to {len(indices)} indices: {', '.join(indices)}")

    for doc in base_data:
        text = doc["text"]
        embedding = doc["embedding"]

        # Add metadata for filtering experiments
        category = categorize_text(text)
        text_length = len(text)

        for index in indices:
            # Add index operation
            batch_operations.append({"index": {"_index": index, "_id": f"{doc['id']}"}})

            # Add document data with metadata
            batch_operations.append(
                {
                    "text": text,
                    "embedding": embedding,
                    "category": category,
                    "text_length": text_length,
                }
            )

        doc_count += 1

        # When we reach batch_size, upload the batch
        if len(batch_operations) >= batch_size * 2 * len(
            indices
        ):  # *2 because each doc needs 2 operations
            print(
                f"Uploading batch of {batch_size} documents per index (total processed: {doc_count})"
            )
            start_time = time.time()

            try:
                resp = es.bulk(operations=batch_operations)
                upload_time = time.time() - start_time
                print(f"Upload completed in {upload_time:.2f} seconds")

                # Check for errors
                if resp["errors"]:
                    error_count = sum(
                        1 for item in resp["items"] if "error" in item.get("index", {})
                    )
                    print(f"{error_count} documents failed to index")
                else:
                    print(f"Successfully indexed batch")

            except Exception as e:
                print(f"Batch upload failed: {e}")
                print(resp)

            # Clear batch for next iteration
            batch_operations = []

        if doc_count >= max_docs:
            print(f"Reached maximum document limit: {max_docs}")
            break

    # Upload remaining documents if any
    if batch_operations:
        remaining_docs = len(batch_operations) // (2 * len(indices))
        print(f"Uploading final batch of {remaining_docs} documents per index")

        try:
            resp = es.bulk(operations=batch_operations)
            if resp["errors"]:
                error_count = sum(
                    1 for item in resp["items"] if "error" in item.get("index", {})
                )
                print(f"{error_count} documents in final batch failed to index")
            else:
                print(f"Successfully indexed final batch")
        except Exception as e:
            print(f"Final batch upload failed: {e}")

    print(f"Total documents processed: {doc_count}")
    print(f"Total documents per index: {doc_count}")

    # Print index stats
    for index in indices:
        try:
            stats = es.indices.stats(index=index)
            doc_count_actual = stats["indices"][index]["total"]["docs"]["count"]
            size_mb = stats["indices"][index]["total"]["store"]["size_in_bytes"] / (
                1024 * 1024
            )
            print(f"{index}: {doc_count_actual} docs, {size_mb:.1f} MB")
        except Exception as e:
            print(f"Could not get stats for {index}: {e}")


def main():
    # Get environment variables
    host = os.getenv("ES_HOST")
    api_key = os.getenv("API_KEY")

    if not host or not api_key:
        raise ValueError("Please set ES_HOST and API_KEY environment variables")

    # Create Elasticsearch client
    es = Elasticsearch(hosts=host, api_key=api_key, request_timeout=120)

    # print("Checking cluster health...")
    try:
        cluster_info = es.info()
        print("Connected to deployment: ", cluster_info)

    except Exception as e:
        print(f"Could not connect to Elasticsearch: {e}")
        return
    if cluster_info["name"] == "serverless":
        cluster_type = "serverless"
        for key in mappings.keys():
            del mappings[key]["settings"]
    else:
        cluster_type = "hosted"

    # Create indices
    print("\nCreating indices...")
    for index_name, mapping in mappings.items():
        try:
            if es.indices.exists(index=index_name):
                print(f" Index already exists: {index_name}")
                # delete and recreate
                es.indices.delete(index=index_name)
                es.indices.create(index=index_name, body=mapping)
                print(f"Recreated {index_name}")
            else:
                es.indices.create(index=index_name, body=mapping)
                print(f"Created {index_name}")
        except Exception as e:
            print(f"Failed to create {index_name}: {e}")

    # Upload documents
    print("\nStarting document upload...")
    upload_to_elasticsearch(
        es, list(mappings.keys()), batch_size=300, max_docs=50000
    )  # Reduced for faster testing

    print("\nUpload process completed!")


if __name__ == "__main__":
    main()
