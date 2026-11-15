# Editor image origin regression

These screenshots come from the neutral real-browser regression fixture.
The fixture compiles the actual environment generator and asset resolver.

Before: public root and deployment-subpath images fail; external and managed-media
controls still load. After: all four cases load, while the test asserts that stored
paths and external/managed references remain unchanged. The same compiled module is
also served from a second origin.

The images demonstrate the fixture, not a completed production deployment.
