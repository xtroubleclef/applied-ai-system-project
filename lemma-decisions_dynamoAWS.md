# Lemma Glossary

*Generated April 27, 2026*

## Database

### Eventually consistent key-value store over strongly consistent relational database
Amazon chose to build a system that sacrifices strong consistency for high availability because production experience showed that relational databases providing ACID guarantees have poor availability, and the CAP theorem prevents simultaneous achievement of consistency and availability during network failures.

> *"Data stores that provide ACID guarantees tend to have poor availability"*

*Confidence: 100%*

### Single-key updates without ACID isolation over multi-item transactions
Dynamo permits only single-key updates without isolation guarantees because most Amazon services only store and retrieve data by primary key and do not need complex multi-item transaction functionality.

> *"Does not provide isolation guarantees and permits only single key updates"*

*Confidence: 100%*

### Simple key-value query model over relational schema
Dynamo uses a simple key-value interface without relational schema because a significant portion of Amazon's services only need read/write operations on data identified by key and do not require complex relational querying.

> *"Simple read and write operations to data item uniquely identified by key; no relational schema needed"*

*Confidence: 100%*

## Architecture

### Read-time conflict resolution over write-time conflict resolution
Dynamo resolves conflicts during reads rather than writes to ensure the system remains 'always writeable' and never rejects customer updates, which is critical for services like shopping carts that must function during failures.

> *"Push complexity of conflict resolution to reads to ensure writes are never rejected"*

*Confidence: 100%*

### Application-assisted conflict resolution over data store conflict resolution
Applications resolve conflicts themselves rather than relying on simple data store policies like 'last write wins' because applications understand their data schema and can implement resolution methods best suited for their clients' experience.

> *"Application aware of data schema can decide conflict resolution method best suited for client experience"*

*Confidence: 100%*

### Decentralized peer-to-peer architecture over centralized control
Dynamo favors decentralized peer-to-peer techniques over centralized control because historical experience showed that centralized control resulted in outages, and decentralization creates a simpler, more scalable, and more available system.

> *"Decentralized peer-to-peer techniques over centralized control...centralized control resulted in outages"*

*Confidence: 100%*

### Symmetric peer nodes over distinguished/special nodes
Every node in Dynamo has identical responsibilities with no distinguished nodes performing special roles because symmetry simplifies system provisioning and maintenance while eliminating single points of failure.

> *"Every node should have same set of responsibilities as peers; no distinguished nodes"*

*Confidence: 100%*

### Incremental one-node-at-a-time scalability
Dynamo scales out one storage node at a time with minimal impact on operators and the system itself, enabling gradual capacity growth without major disruptions.

> *"Incremental scalability: scale out one storage host at a time with minimal impact"*

*Confidence: 100%*

### Heterogeneous work distribution proportional to server capabilities
The system distributes work proportionally to individual server capabilities, enabling addition of new higher-capacity nodes without requiring simultaneous upgrades to all existing hosts.

> *"Work distribution must be proportional to capabilities of individual servers"*

*Confidence: 100%*

## Product

### 99.9th percentile SLA measurement over mean/median metrics
Amazon measures performance at the 99.9th percentile rather than averages or medians because mean/median metrics do not address the experience of important customer segments like those with longer purchase histories requiring more processing.

> *"SLAs expressed and measured at 99.9th percentile of distribution"*

*Confidence: 100%*

