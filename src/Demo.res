switch StateTypes.solved(3) {
| Error(_) => Console.error("Unable to create solved cube.")
| Ok(state) => {
    let facelets = FaceletCodec.render(state)
    Console.log(facelets)
    switch FaceletCodec.parse(~size=3, facelets) {
    | Ok(parsed) => {
        Console.log(FaceletCodec.render(parsed))
        let net = NetCodec.render(parsed)
        Console.log(net)
        switch NetCodec.parse(~size=3, net) {
        | Ok(fromNet) => Console.log(FaceletCodec.render(fromNet))
        | Error(_) => Console.error("Net round-trip failed.")
        }
      }
    | Error(_) => Console.error("Facelet round-trip failed.")
    }
  }
}
