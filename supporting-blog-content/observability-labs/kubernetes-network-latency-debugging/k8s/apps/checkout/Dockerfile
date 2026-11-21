# go.mod needs Go 1.26 (otelhttptrace v0.72.0). CGO_ENABLED=0 selects the pure Go resolver.
FROM golang:1.26 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
RUN CGO_ENABLED=0 go build -trimpath -o /checkout .

FROM gcr.io/distroless/static-debian12
COPY --from=build /checkout /checkout
EXPOSE 8080
ENTRYPOINT ["/checkout"]
