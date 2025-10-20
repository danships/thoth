# types package

This package is not directly imported in the web application. There it uses a path alias. The reason for this
is that the inferred types from zod were not working, everything ended up being `any`.

The backend package does use this as a package directly.
