import React from 'react'
import ReactDOM from 'react-dom'

import * as tf from '@tensorflow/tfjs'
import './styles.css'

const MODEL_URL = process.env.PUBLIC_URL + '/model_web/'
const LABELS_URL = MODEL_URL + 'labels.json'
const MODEL_JSON = MODEL_URL + 'model.json'

const VIDEO = process.env.PUBLIC_URL + '/video.mp4'

const TFWrapper = model => {
  const calculateMaxScores = (scores, numBoxes, numClasses) => {
    const maxes = []
    const classes = []
    for (let i = 0; i < numBoxes; i++) {
      let max = Number.MIN_VALUE
      let index = -1
      for (let j = 0; j < numClasses; j++) {
        if (scores[i * numClasses + j] > max) {
          max = scores[i * numClasses + j]
          index = j
        }
      }
      maxes[i] = max
      classes[i] = index
    }
    return [maxes, classes]
  }

  const buildDetectedObjects = (
    width,
    height,
    boxes,
    scores,
    indexes,
    classes
  ) => {
    const count = indexes.length
    const objects = []
    for (let i = 0; i < count; i++) {
      const bbox = []
      for (let j = 0; j < 4; j++) {
        bbox[j] = boxes[indexes[i] * 4 + j]
      }
      const minY = bbox[0] * height
      const minX = bbox[1] * width
      const maxY = bbox[2] * height
      const maxX = bbox[3] * width
      bbox[0] = minX
      bbox[1] = minY
      bbox[2] = maxX - minX
      bbox[3] = maxY - minY
      objects.push({
        bbox: bbox,
        class: classes[indexes[i]],
        score: scores[indexes[i]]
      })
    }
    return objects
  }

  const detect = input => {
    const batched = tf.tidy(() => {
      const img = tf.browser.fromPixels(input)
      // Reshape to a single-element batch so we can pass it to executeAsync.
      return img.expandDims(0)
    })

    const height = batched.shape[1]
    const width = batched.shape[2]

    return model.executeAsync(batched).then(result => {
      const scores = result[0].dataSync()
      const boxes = result[1].dataSync()

      // clean the webgl tensors
      batched.dispose()
      tf.dispose(result)

      const [maxScores, classes] = calculateMaxScores(
        scores,
        result[0].shape[1],
        result[0].shape[2]
      )

      const prevBackend = tf.getBackend()
      // run post process in cpu
      tf.setBackend('cpu')
      const indexTensor = tf.tidy(() => {
        const boxes2 = tf.tensor2d(boxes, [
          result[1].shape[1],
          result[1].shape[3]
        ])
        return tf.image.nonMaxSuppression(
          boxes2,
          maxScores,
          20, // maxNumBoxes
          0.5, // iou_threshold
          0.5 // score_threshold
        )
      })
      const indexes = indexTensor.dataSync()
      indexTensor.dispose()
      // restore previous backend
      tf.setBackend(prevBackend)

      return buildDetectedObjects(
        width,
        height,
        boxes,
        maxScores,
        indexes,
        classes
      )
    })
  }
  return {
    detect: detect
  }
}

class App extends React.Component {
  videoRef = React.createRef()
  canvasRef = React.createRef()

  componentDidMount() {
    const modelPromise = tf.loadGraphModel(MODEL_JSON)
    const labelsPromise = fetch(LABELS_URL).then(data => data.json())
    Promise.all([modelPromise, labelsPromise])
      .then(values => {
        const [model, labels] = values
        this.detectFrame(this.videoRef.current, model, labels)
      })
      .catch(error => {
        console.error(error)
      })
  }

  detectFrame = (video, model, labels) => {
    TFWrapper(model)
      .detect(video)
      .then(predictions => {
        this.renderPredictions(predictions, labels)
        requestAnimationFrame(() => {
          this.detectFrame(video, model, labels)
        })
      })
  }

  // NOTE This code runs for every frame
  renderPredictions = (predictions, labels) => {
    const ctx = this.canvasRef.current.getContext('2d')
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    // Font options.
    const font = '16px sans-serif'
    ctx.font = font
    ctx.textBaseline = 'top'

    // Clean variables if there is no person OR there are more than one
    if (predictions.length != 1) {
      W = []
      H = []
      P = []
      lf = 0
      fc = 0
    }

    // Only runs if an object was detected (forEach)
    predictions.forEach(prediction => {
      const x = prediction.bbox[0]
      const y = prediction.bbox[1]
      const width = prediction.bbox[2]
      const height = prediction.bbox[3]
      const label = labels[parseInt(prediction.class)]
      // calculateFeatures(height, width)

      W.push(width.toFixed(4))
      H.push(height.toFixed(4))
      P.push((height / width).toFixed(4))

      // Change boxing color 
      if (label === 'danger') {
        // Draw the bounding box
        ctx.strokeStyle = '#FF0000'

        // Draw the label background
        ctx.fillStyle = '#FF0000'
      } else {
        // Draw the bounding box
        ctx.strokeStyle = '#00FFFF'

        // Draw the label background
        ctx.fillStyle = '#00FFFF'
      }

      ctx.lineWidth = 4
      ctx.strokeRect(x, y, width, height)

      const textWidth = ctx.measureText(label).width
      const textHeight = parseInt(font, 10) // base 10
      ctx.fillRect(x, y, textWidth + 4, textHeight + 4)
    })

    // NOTE Style for each detection
    predictions.forEach(prediction => {
      const x = prediction.bbox[0]
      const y = prediction.bbox[1]
      const label = labels[parseInt(prediction.class)]
      // Draw the text last to ensure it's on top
      ctx.fillStyle = '#000000'
      ctx.fillText(label, x, y)
    })
  }

  render() {
    return ( <
      div >
      <
      video src = {
        VIDEO
      }
      className = "size"
      autoPlay loop playsInline muted ref = {
        this.videoRef
      }
      width = "600"
      height = "335" /
      >
      <
      canvas className = "size"
      ref = {
        this.canvasRef
      }
      width = "600"
      height = "335" /
      >
      <
      /div>
    )
  }
}

const rootElement = document.getElementById('root')
ReactDOM.render( < App / > , rootElement)