# Elasticsearch Profile API Testing Framework

This project provides a testing framework for Elasticsearch's Profile API using vector search workloads . The system demonstrates how to leverage Elasticsearch's profiling capabilities to analyze query performance across different vector indexing strategies and configurations.

The project was made for an upcoming Elastic search labs blog.

## Profile API Testing Experiments
The VectorSearchProfiler class implements four distinct experiments to test different aspects of the Profile API:

- Experiment 1: Comparing query performance on a flat dense vector vs a HNSW quantized dense vector.
- Experiment 2:  Understand the effect of oversharding in vector search.
- Experiment 3: Understand how Elastic boosts performance of a vector query with filters by applying them before the more expensive KNN algorithm.
- Experiment 4: Comparing performance of a cold query vs a cached query.

 
## Profile Data Extraction
The core profiling functionality is implemented in extract_profile_data() which parses Elasticsearch's Profile API response structure. The method extracts:

- Vector search timing from the DFS phase KNN operations 
- Query processing time from the searches phase 
- Collection and fetch timing from respective phases



## Getting started

### Prerequisites

- Python 3.x
- A Elasticsearch deployment
- Libraries
  - Elasticsearch
  - Pandas
  - Numpy
  - Matplotlib
  - Datasets (HuggingFace library) 



To reproduce this experiment you can follow these steps:


1. Clone the repository
```
git clone https://github.com/Alex1795/profiler_experiments_blog.git
```
2. Install required libraries:
```
pip install -r requirements.txt
```
3. Run the upload script. Make sure to have the following environment variables set beforehand
- ES_HOST
- API_KEY

```
python data_upload.py
```
This might take several minutes, it is streaming the data from HuggingFace.

4. Once the data is indexed in Elastic you can run the experiments using:
```
python profiler_experiments.py
```

