"""Delete the demo index."""

import sys

from es import get_client, index_name

if __name__ == "__main__":
    name = sys.argv[1] if len(sys.argv) > 1 else index_name()
    es = get_client()
    if es.indices.exists(index=name):
        es.indices.delete(index=name)
        print(f"deleted index {name}")
    else:
        print(f"index {name} not found, nothing to delete")
