{
  "targets": [{ "target_name": "job", "sources": ["job.cc"], "conditions": [["OS=='win'", {"libraries": ["kernel32.lib"]}]] }]
}
